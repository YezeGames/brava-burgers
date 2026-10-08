package app.bravaburgers.repartidor.nativeapp.viewmodel

import android.content.Context
import app.bravaburgers.repartidor.nativeapp.update.AppApkInstaller
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import app.bravaburgers.repartidor.nativeapp.BravaConstants
import app.bravaburgers.repartidor.nativeapp.data.GeocodeClient
import app.bravaburgers.repartidor.nativeapp.data.RepartidorRepository
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.data.Session
import app.bravaburgers.repartidor.nativeapp.data.RealtimeConfigDto
import app.bravaburgers.repartidor.nativeapp.location.LocationHelper
import app.bravaburgers.repartidor.nativeapp.mapbox.BravaMapboxNavigation
import app.bravaburgers.repartidor.nativeapp.mapbox.BravaNavTripFormat
import app.bravaburgers.repartidor.nativeapp.ui.screens.HistorialEntregaUi
import app.bravaburgers.repartidor.nativeapp.ui.screens.historialFromStop
import kotlin.math.roundToInt
import app.bravaburgers.repartidor.nativeapp.push.RouteLocalNotifier
import app.bravaburgers.repartidor.nativeapp.push.PushRegistrar
import app.bravaburgers.repartidor.nativeapp.session.RepartoSessionForegroundService
import app.bravaburgers.repartidor.nativeapp.session.RouteEvents
import app.bravaburgers.repartidor.nativeapp.session.RouteGpsSync
import app.bravaburgers.repartidor.nativeapp.session.SessionWorkScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import app.bravaburgers.repartidor.nativeapp.session.RouteSyncEvent
import app.bravaburgers.repartidor.nativeapp.update.AppUpdateChecker
import app.bravaburgers.repartidor.nativeapp.update.AppUpdateOffer
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class RepartidorUiState(
    val session: Session? = null,
    val stops: List<RouteStop> = emptyList(),
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val connected: Boolean = true,
    val error: String? = null,
    val activeOrn: String? = null,
    val tripStarted: Boolean = false,
    /** Mensaje de preparación / error de geocode antes de abrir Mapbox. */
    val navManeuver: String = "",
    val navEtaMinutes: Int? = null,
    val navRouteKm: Double? = null,
    val navMeta: String = "",
    val navLoading: Boolean = false,
    val navDest: Pair<Double, Double>? = null,
    /** Repartidor (GPS vivo) — lat,lng */
    val navDriver: Pair<Double, Double>? = null,
    val trackingOrn: String? = null,
    val appUpdate: AppUpdateOffer? = null,
    val appUpdateBusy: Boolean = false,
    val appUpdateProgress: Int = 0,
    val appUpdateIndeterminate: Boolean = false,
    val appUpdateError: String? = null,
    /** true solo en el primer chequeo OTA del proceso (no al volver de segundo plano). */
    val appUpdateChecking: Boolean = true,
    val homeMapDriver: Pair<Double, Double>? = null,
    val homeMapBearing: Float? = null,
    val homeMapSpeedKmh: Int = 0,
    val homeMapWaitingGps: Boolean = false,
    val deliveryHistory: List<HistorialEntregaUi> = emptyList(),
    val signupMessage: String? = null,
    val signupPending: SignupPendingUi? = null,
    val supportOrn: String? = null,
    val supportSheetOpen: Boolean = false,
    val supportStepChat: Boolean = false,
    val supportThreadId: String? = null,
    val supportTopic: String? = null,
    val supportStatus: String? = null,
    val supportMessages: List<SupportChatLine> = emptyList(),
    val supportLoading: Boolean = false,
    val supportError: String? = null,
    val supportConfirmClose: Boolean = false,
)

data class SupportChatLine(
    val sender: String,
    val body: String,
)

/** Tras enviar solicitud de cuenta (pantalla «Solicitud enviada», demo). */
data class SignupPendingUi(
    val nombre: String,
    val apellido: String,
    val telefono: String,
    val login: String,
) {
    fun displayName(): String = "$nombre $apellido".trim()
}

@OptIn(FlowPreview::class)
class RepartidorViewModel(
    private val repo: RepartidorRepository,
    private val realtime: app.bravaburgers.repartidor.nativeapp.realtime.RepartidorRealtimeCoordinator? = null,
) : ViewModel() {
    private val _ui = MutableStateFlow(RepartidorUiState())
    val ui: StateFlow<RepartidorUiState> = _ui.asStateFlow()
    private val geocode = GeocodeClient()
    private val geocodeCache = mutableMapOf<String, Pair<Double, Double>>()
    private val routeRefreshMutex = Mutex()
    private var loginRealtime: RealtimeConfigDto? = null
    private var bootstrappedToken: String? = null
    /** Evita listRuta extra mientras el usuario espera respuesta de una acción. */
    private var suppressBackgroundRefresh = 0
    private var lastForegroundRefreshMs = 0L
    /** Invalida refreshes en vuelo al cerrar sesión (estilo Uber: UI primero). */
    private var authEpoch = 0
    private var suppressSessionRestore = false
    private var lastKnownDriverLatLng: Pair<Double, Double>? = null
    /** Invalida coroutines de geocode si cambió la parada o se cerró navegación. */
    private var navGeneration = 0
    private var routeListReady = false
    private var homeMapPreviewActive = false
    /** Parada recién entregada: no avisar "Pedido cancelado" al sacarla de la ruta. */
    private var pendingEntregaRemovedOrn: String? = null

    private val _routeSyncEvents = MutableSharedFlow<RouteSyncEvent>(extraBufferCapacity = 4)
    val routeSyncEvents = _routeSyncEvents.asSharedFlow()

    val sessionFlow =
        repo.sessionStore.sessionFlow.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        BravaMapboxNavigation.registerDefaultRouteProgressListener { distanceM, durationSec ->
            if (distanceM != null && durationSec != null) {
                val summary = BravaNavTripFormat.format(distanceM, durationSec)
                val km = distanceM / 1000.0
                val min = (durationSec / 60.0).roundToInt().coerceAtLeast(1)
                _ui.value =
                    _ui.value.copy(
                        navRouteKm = km,
                        navEtaMinutes = min,
                        navMeta = summary.primaryLine,
                    )
            }
        }
        viewModelScope.launch {
            sessionFlow.collect { s ->
                if (suppressSessionRestore && s != null) return@collect
                if (!suppressSessionRestore || s == null) {
                    _ui.value = _ui.value.copy(session = s)
                }
                val ctx = repo.appContext
                if (s != null) {
                    val orn =
                        _ui.value.stops
                            .firstOrNull { it.estado.equals("en_camino", ignoreCase = true) }
                            ?.orn
                            .orEmpty()
                            .ifEmpty { _ui.value.activeOrn.orEmpty() }
                    RepartoSessionForegroundService.persistSession(ctx, s.token, repo.apiKey, orn)

                    if (bootstrappedToken != s.token) {
                        bootstrappedToken = s.token
                        if (shouldBlockForMandatoryUpdate()) {
                            _ui.value.appUpdate?.let { mandatory ->
                                if (_ui.value.session != null) {
                                    viewModelScope.launch { clearSessionForMandatoryUpdate(mandatory) }
                                }
                            }
                        } else if (!_ui.value.appUpdateChecking) {
                            bootstrapLoggedInSession(ctx, s.token)
                        }
                    } else if (_ui.value.stops.isEmpty() && !shouldBlockForMandatoryUpdate()) {
                        refreshRoute(s.token, pull = false)
                    }
                } else if (bootstrappedToken != null) {
                    bootstrappedToken = null
                    launch(Dispatchers.Default) {
                        realtime?.stop()
                        SessionWorkScheduler.cancel(ctx)
                        RepartoSessionForegroundService.stopSession(ctx)
                    }
                }
            }
        }
        refreshAppUpdate(showBootGate = true)
        viewModelScope.launch {
            RouteEvents.refresh
                .debounce(350)
                .collect { reason ->
                    if (reason == "app_update") {
                        refreshAppUpdate(showBootGate = false, forceNetwork = true)
                        return@collect
                    }
                    if (suppressBackgroundRefresh > 0) return@collect
                    if (reason == "foreground") {
                        val now = System.currentTimeMillis()
                        if (now - lastForegroundRefreshMs < 45_000L && _ui.value.stops.isNotEmpty()) {
                            return@collect
                        }
                        lastForegroundRefreshMs = now
                    }
                    refreshRoute(pull = false)
                }
        }
    }

    fun login(login: String, password: String) {
        if (shouldBlockForMandatoryUpdate()) return
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null, signupMessage = null)
            repo.login(login, password)
                .onSuccess { bundle ->
                    loginRealtime = bundle.realtime
                    _ui.value = _ui.value.copy(loading = false, error = null)
                }
                .onFailure {
                    _ui.value = _ui.value.copy(loading = false, error = it.message ?: "Error")
                }
        }
    }

    fun signup(
        nombre: String,
        apellido: String,
        telefono: String,
        password: String,
        password2: String,
    ) {
        if (shouldBlockForMandatoryUpdate()) return
        if (password.length < 6) {
            _ui.value = _ui.value.copy(signupMessage = null, error = "La contraseña debe tener al menos 6 caracteres.")
            return
        }
        if (password != password2) {
            _ui.value = _ui.value.copy(signupMessage = null, error = "Las contraseñas no coinciden.")
            return
        }
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null, signupMessage = null, signupPending = null)
            repo.signup(nombre, apellido, telefono, password)
                .onSuccess {
                    _ui.value =
                        _ui.value.copy(
                            loading = false,
                            error = null,
                            signupMessage = null,
                            signupPending =
                                SignupPendingUi(
                                    nombre = nombre.trim(),
                                    apellido = apellido.trim(),
                                    telefono = telefono.trim(),
                                    login = proposeSignupLogin(apellido, nombre),
                                ),
                        )
                }
                .onFailure {
                    _ui.value =
                        _ui.value.copy(
                            loading = false,
                            error = signupErrorMessage(it.message),
                            signupPending = null,
                        )
                }
        }
    }

    fun clearSignupPending() {
        _ui.value = _ui.value.copy(signupPending = null, error = null)
    }

    private fun proposeSignupLogin(apellido: String, nombre: String): String {
        val fromAp = apellido.replace(Regex("[^a-zA-Z0-9]"), "").lowercase()
        if (fromAp.length >= 2) return fromAp
        val fromNom = nombre.replace(Regex("[^a-zA-Z0-9]"), "").lowercase()
        if (fromNom.length >= 2) return fromNom
        return "rider"
    }

    private fun signupErrorMessage(code: String?): String =
        when (code) {
            "login_taken" -> "Ese usuario ya existe. Pedí ayuda a cocina."
            "signup_pending_exists" -> "Ya hay una solicitud pendiente con ese usuario."
            "weak_password" -> "La contraseña debe tener al menos 6 caracteres."
            "invalid_telefono" -> "Revisá el número de teléfono."
            else -> code ?: "No se pudo enviar la solicitud"
        }

    fun openSupportSheet(orn: String) {
        _ui.value =
            _ui.value.copy(
                supportOrn = orn,
                supportSheetOpen = true,
                supportStepChat = false,
                supportConfirmClose = false,
                supportError = null,
            )
        refreshSupportState(orn)
    }

    fun minimizeSupportSheet() {
        _ui.value = _ui.value.copy(supportSheetOpen = false, supportConfirmClose = false)
    }

    fun showSupportCloseConfirm(show: Boolean) {
        _ui.value = _ui.value.copy(supportConfirmClose = show)
    }

    fun dismissSupportForOrn(orn: String) {
        if (_ui.value.supportOrn != orn) return
        _ui.value =
            _ui.value.copy(
                supportSheetOpen = false,
                supportConfirmClose = false,
            )
    }

    private fun mapSupportMessages(list: List<app.bravaburgers.repartidor.nativeapp.data.SupportMessageDto>?): List<SupportChatLine> =
        list.orEmpty().map { m ->
            SupportChatLine(sender = m.sender.orEmpty(), body = m.body.orEmpty())
        }

    private fun applySupportResponse(orn: String, out: app.bravaburgers.repartidor.nativeapp.data.SupportStateResponse) {
        val thread = out.thread
        val open = thread != null && thread.status == "open"
        _ui.value =
            _ui.value.copy(
                supportOrn = orn,
                supportThreadId = thread?.id,
                supportTopic = thread?.topic,
                supportStatus = thread?.status,
                supportMessages = mapSupportMessages(out.messages),
                supportStepChat = thread != null,
                supportLoading = false,
                supportError = null,
                supportSheetOpen = if (open || thread != null) _ui.value.supportSheetOpen else _ui.value.supportSheetOpen,
            )
    }

    fun refreshSupportState(orn: String) {
        val token = _ui.value.session?.token ?: return
        viewModelScope.launch {
            _ui.value = _ui.value.copy(supportLoading = true, supportError = null)
            repo.supportGetState(token, orn)
                .onSuccess { applySupportResponse(orn, it) }
                .onFailure {
                    _ui.value =
                        _ui.value.copy(
                            supportLoading = false,
                            supportError = it.message ?: "Error",
                            supportStepChat = false,
                        )
                }
        }
    }

    fun openSupportTopic(orn: String, parada: Int?, topic: String) {
        val token = _ui.value.session?.token ?: return
        viewModelScope.launch {
            _ui.value = _ui.value.copy(supportLoading = true, supportError = null)
            repo.supportOpenThread(token, orn, parada, topic)
                .onSuccess {
                    applySupportResponse(orn, it)
                    _ui.value = _ui.value.copy(supportStepChat = true, supportSheetOpen = true)
                }
                .onFailure {
                    _ui.value =
                        _ui.value.copy(
                            supportLoading = false,
                            supportError = it.message ?: "Error",
                        )
                }
        }
    }

    fun sendSupportMessage(text: String) {
        val token = _ui.value.session?.token ?: return
        val threadId = _ui.value.supportThreadId ?: return
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        if (_ui.value.supportStatus == "closed") return
        viewModelScope.launch {
            repo.supportSendMessage(token, threadId, trimmed)
                .onSuccess { out ->
                    _ui.value =
                        _ui.value.copy(
                            supportMessages = mapSupportMessages(out.messages),
                            supportError = null,
                        )
                }
                .onFailure {
                    _ui.value = _ui.value.copy(supportError = it.message ?: "Error")
                }
        }
    }

    fun confirmCloseSupport() {
        val token = _ui.value.session?.token ?: return
        val threadId = _ui.value.supportThreadId ?: return
        val orn = _ui.value.supportOrn ?: return
        viewModelScope.launch {
            _ui.value = _ui.value.copy(supportLoading = true, supportConfirmClose = false)
            repo.supportCloseThread(token, threadId)
                .onSuccess {
                    refreshSupportState(orn)
                    _ui.value =
                        _ui.value.copy(
                            supportSheetOpen = false,
                            supportLoading = false,
                        )
                }
                .onFailure {
                    _ui.value =
                        _ui.value.copy(
                            supportLoading = false,
                            supportError = it.message ?: "Error",
                        )
                }
        }
    }

    fun dismissAppUpdate() {
        if (_ui.value.appUpdateBusy) return
        if (_ui.value.appUpdate?.required == true) return
        _ui.value =
            _ui.value.copy(
                appUpdate = null,
                appUpdateError = null,
                appUpdateProgress = 0,
                appUpdateIndeterminate = false,
            )
    }

    fun clearAppUpdateError() {
        _ui.value = _ui.value.copy(appUpdateError = null)
    }

    fun requestInstallPermission(context: Context) {
        AppApkInstaller.openInstallPermissionSettings(context)
    }

    fun installAppUpdate(context: Context) {
        val offer = _ui.value.appUpdate ?: return
        if (_ui.value.appUpdateBusy) return
        if (!AppApkInstaller.canInstallPackages(context)) {
            _ui.value =
                _ui.value.copy(
                    appUpdateError =
                        "Permití «Instalar apps desconocidas» para Brava Repartidor y volvé a tocar Actualizar.",
                )
            return
        }
        viewModelScope.launch {
            _ui.value =
                _ui.value.copy(
                    appUpdateBusy = true,
                    appUpdateError = null,
                    appUpdateProgress = 0,
                    appUpdateIndeterminate = false,
                )
            try {
                val apk =
                    withContext(Dispatchers.IO) {
                        AppApkInstaller.downloadApk(
                            context.applicationContext,
                            offer.apkUrl,
                            offer.versionCode,
                        ) { pct ->
                            viewModelScope.launch(Dispatchers.Main.immediate) {
                                if (pct < 0) {
                                    _ui.value = _ui.value.copy(appUpdateIndeterminate = true)
                                } else {
                                    _ui.value =
                                        _ui.value.copy(
                                            appUpdateProgress = pct,
                                            appUpdateIndeterminate = false,
                                        )
                                }
                            }
                        }
                    }
                AppApkInstaller.launchInstall(context, apk)
                _ui.value =
                    _ui.value.copy(
                        appUpdateBusy = false,
                        appUpdate = if (offer.required) offer else null,
                    )
            } catch (e: Exception) {
                _ui.value =
                    _ui.value.copy(
                        appUpdateBusy = false,
                        appUpdateError = e.message ?: "No se pudo descargar la actualización",
                    )
            }
        }
    }

    private fun shouldBlockForMandatoryUpdate(): Boolean =
        _ui.value.appUpdateChecking || _ui.value.appUpdate?.required == true

    /**
     * OTA: una vez al abrir la app ([showBootGate]) o en silencio cuando el servidor avisa (FCM `app_update`).
     * No se llama al reanudar desde segundo plano — evita gate + pérdida de navegación Mapbox.
     */
    fun refreshAppUpdate(showBootGate: Boolean = false, forceNetwork: Boolean = false) {
        viewModelScope.launch {
            val mandatoryPending = _ui.value.appUpdate?.takeIf { it.required }
            if (showBootGate && mandatoryPending == null) {
                _ui.value =
                    _ui.value.copy(
                        appUpdateChecking = true,
                        appUpdateError = null,
                        appUpdate = null,
                    )
            } else {
                _ui.value = _ui.value.copy(appUpdateError = null)
            }
            val offer =
                withContext(Dispatchers.IO) {
                    AppUpdateChecker.fetchOfferIfNewer(repo.appContext, forceNetwork)
                }
            if (offer?.required == true) {
                clearSessionForMandatoryUpdate(offer)
            } else {
                _ui.value =
                    _ui.value.copy(
                        appUpdate = offer ?: mandatoryPending,
                        appUpdateChecking = false,
                    )
                val token = _ui.value.session?.token
                if (token != null && bootstrappedToken == token && _ui.value.stops.isEmpty()) {
                    bootstrapLoggedInSession(repo.appContext, token)
                }
            }
        }
    }

    private fun bootstrapLoggedInSession(ctx: Context, token: String) {
        viewModelScope.launch {
            PushRegistrar.registerAfterLogin(ctx, repo, token)
            val rt = loginRealtime
            loginRealtime = null
            realtime?.start(token, rt)
            SessionWorkScheduler.schedule(ctx)
            applyRefresh(token, pull = false, refreshing = true)
        }
    }

    /** Cierra sesión y navegación; deja solo el cartel OTA obligatorio. */
    private suspend fun clearSessionForMandatoryUpdate(offer: AppUpdateOffer) {
        if (!offer.required) return
        authEpoch++
        suppressSessionRestore = true
        bootstrappedToken = null
        routeListReady = false
        navGeneration++
        BravaMapboxNavigation.stopActiveGuidance()
        lastKnownDriverLatLng = null
        val ctx = repo.appContext
        RepartoSessionForegroundService.stopSession(ctx)
        SessionWorkScheduler.cancel(ctx)
        realtime?.stop()
        withContext(Dispatchers.IO) {
            runCatching { repo.logout() }
        }
        suppressSessionRestore = false
        _ui.value =
            RepartidorUiState(
                appUpdate = offer,
                appUpdateChecking = false,
            )
    }

    fun logout() {
        authEpoch++
        suppressSessionRestore = true
        bootstrappedToken = null
        routeListReady = false
        navGeneration++
        BravaMapboxNavigation.stopActiveGuidance()
        lastKnownDriverLatLng = null
        val ctx = repo.appContext
        RepartoSessionForegroundService.stopSession(ctx)
        SessionWorkScheduler.cancel(ctx)
        realtime?.stop()
        _ui.value = RepartidorUiState()
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.logout()
                }
            } finally {
                suppressSessionRestore = false
            }
        }
    }

    fun refreshRoute(pull: Boolean = true) {
        val token = _ui.value.session?.token ?: return
        refreshRoute(token, pull)
    }

    private fun refreshRoute(token: String, pull: Boolean) {
        if (shouldBlockForMandatoryUpdate()) return
        viewModelScope.launch {
            applyRefresh(token, pull = pull, refreshing = pull)
        }
    }

    private suspend fun refreshRouteAndWait(token: String): Result<List<RouteStop>> {
        return applyRefresh(token, pull = false, refreshing = false)
    }

    private suspend fun applyRefresh(
        token: String,
        pull: Boolean,
        refreshing: Boolean,
    ): Result<List<RouteStop>> =
        routeRefreshMutex.withLock {
            val epoch = authEpoch
            if (_ui.value.session?.token != token) {
                return@withLock Result.failure(Exception("session_gone"))
            }
            if (!pull && !refreshing) {
                _ui.value = _ui.value.copy(loading = true, error = null)
            } else if (refreshing) {
                _ui.value = _ui.value.copy(refreshing = true, error = null)
            } else {
                _ui.value = _ui.value.copy(loading = true, error = null)
            }
            val result = repo.fetchRoute(token)
            if (epoch != authEpoch || _ui.value.session?.token != token) {
                return@withLock Result.failure(Exception("session_gone"))
            }
            result
                .onSuccess { list ->
                    if (epoch == authEpoch && _ui.value.session?.token == token) {
                        applyStopsFromServer(token, list)
                    }
                }
                .onFailure {
                    if (epoch == authEpoch && _ui.value.session?.token == token) {
                        _ui.value =
                            _ui.value.copy(
                                loading = false,
                                refreshing = false,
                                connected = false,
                                error = it.message,
                            )
                    }
                }
            result
        }

    private fun applyStopsFromServer(
        token: String,
        list: List<RouteStop>,
        expectedRemovedOrns: Set<String> = emptySet(),
    ) {
        if (_ui.value.session?.token != token) return
        val previous = _ui.value.stops
        val merged =
            list.map { incoming ->
                val prev = previous.find { it.orn == incoming.orn }
                if (prev?.items.isNullOrEmpty()) incoming else incoming.copy(items = prev.items)
            }
        val newOrns = merged.map { it.orn }.toSet()
        val silentRemovals =
            expectedRemovedOrns + setOfNotNull(pendingEntregaRemovedOrn)
        val removed =
            if (routeListReady) {
                previous.filter { it.orn !in newOrns && it.orn !in silentRemovals }
            } else {
                emptyList()
            }
        if (pendingEntregaRemovedOrn != null && previous.any { it.orn == pendingEntregaRemovedOrn && it.orn !in newOrns }) {
            pendingEntregaRemovedOrn = null
        }
        routeListReady = true

        if (removed.isNotEmpty()) {
            val tracking = _ui.value.trackingOrn
            if (tracking != null && removed.any { it.orn == tracking }) {
                stopNavigationQuiet()
            }
            val next = pickNextStop(merged)
            val (title, body) = routeRemovedCopy(removed, merged.isEmpty())
            viewModelScope.launch {
                _routeSyncEvents.emit(
                    RouteSyncEvent(
                        title = title,
                        body = body,
                        removed = removed,
                        nextStop = next,
                        routeCleared = merged.isEmpty() && previous.isNotEmpty(),
                    ),
                )
            }
            if (tracking != null && removed.any { it.orn == tracking }) {
                _ui.value =
                    _ui.value.copy(
                        activeOrn = next?.orn,
                    )
                RepartoSessionForegroundService.setActiveOrn(
                    repo.appContext,
                    next?.orn.orEmpty(),
                )
            }
        }

        _ui.value =
            _ui.value.copy(
                stops = merged,
                loading = false,
                refreshing = false,
                connected = true,
                tripStarted =
                    if (merged.isEmpty()) {
                        homeMapPreviewActive = false
                        false
                    } else {
                        merged.any { s ->
                            s.estado.equals("en_camino", ignoreCase = true) ||
                                s.estado.equals("en_preparacion", ignoreCase = true)
                        } &&
                            (_ui.value.tripStarted ||
                                merged.any { s -> s.estado.equals("en_camino", ignoreCase = true) })
                    },
            )
        RouteGpsSync.syncFromStops(
            repo.appContext,
            token,
            repo.apiKey,
            merged,
            _ui.value.trackingOrn,
        )
    }

    private fun routeRemovedCopy(
        removed: List<RouteStop>,
        allCleared: Boolean,
    ): Pair<String, String> {
        if (allCleared) {
            return "Ruta vacía" to "Cocina limpió tu ruta en la app."
        }
        if (removed.size == 1) {
            val s = removed.first()
            val label =
                listOfNotNull(
                    s.parada?.let { "Parada $it" },
                    s.cliente?.trim()?.takeIf { it.isNotEmpty() },
                ).joinToString(" · ")
            return "Pedido cancelado" to (label.ifBlank { "Ya no está en tu ruta." })
        }
        val body =
            removed.joinToString(" · ") { s ->
                listOfNotNull(
                    s.parada?.let { "Parada $it" },
                    s.cliente?.trim()?.takeIf { it.isNotEmpty() },
                ).joinToString(" · ")
            }
        return "Te quitaron ${removed.size} paradas" to body
    }

    private suspend inline fun <T> withActionRefreshGuard(block: suspend () -> T): T {
        suppressBackgroundRefresh++
        try {
            return block()
        } finally {
            suppressBackgroundRefresh--
        }
    }

    fun ensureStopDetail(orn: String) {
        val token = _ui.value.session?.token ?: return
        val existing = stopFor(orn)
        if (!existing?.items.isNullOrEmpty()) return
        viewModelScope.launch {
            repo.fetchStopDetail(token, orn)
                .onSuccess { detail ->
                    _ui.value =
                        _ui.value.copy(
                            stops =
                                _ui.value.stops.map { s ->
                                    if (s.orn == orn) detail else s
                                },
                        )
                }
        }
    }

    fun iniciarRecorrido(onDone: (RouteStop?) -> Unit) {
        val token = _ui.value.session?.token ?: return
        viewModelScope.launch {
            withActionRefreshGuard {
                _ui.value = _ui.value.copy(loading = true, error = null)
                repo.iniciarRecorrido(token)
            }.onSuccess { pedidos ->
                _ui.value = _ui.value.copy(tripStarted = true)
                if (!pedidos.isNullOrEmpty()) {
                    applyStopsFromServer(token, pedidos)
                    val next = pickNextStop(pedidos)
                    _ui.value = _ui.value.copy(activeOrn = next?.orn, loading = false)
                    next?.orn?.let { RepartoSessionForegroundService.setActiveOrn(repo.appContext, it) }
                    onDone(next)
                } else {
                    refreshRouteAndWait(token)
                        .onSuccess { list ->
                            val next = pickNextStop(list)
                            _ui.value = _ui.value.copy(activeOrn = next?.orn, loading = false)
                            next?.orn?.let { RepartoSessionForegroundService.setActiveOrn(repo.appContext, it) }
                            onDone(next)
                        }
                        .onFailure {
                            _ui.value = _ui.value.copy(loading = false)
                            onDone(pickNextStop(_ui.value.stops))
                        }
                }
            }.onFailure {
                _ui.value = _ui.value.copy(loading = false, error = it.message)
            }
        }
    }

    fun setActiveOrn(orn: String) {
        _ui.value = _ui.value.copy(activeOrn = orn)
        RepartoSessionForegroundService.setActiveOrn(repo.appContext, orn)
    }

    fun confirmarLlegada(orn: String, onDone: () -> Unit) {
        val token = _ui.value.session?.token ?: return
        viewModelScope.launch {
            withActionRefreshGuard {
                _ui.value = _ui.value.copy(loading = true, error = null)
                repo.confirmarLlegada(token, orn)
            }.onSuccess { llegadaAt ->
                val at = llegadaAt.orEmpty().ifBlank { java.time.Instant.now().toString() }
                _ui.value =
                    _ui.value.copy(
                        stops =
                            _ui.value.stops.map { s ->
                                if (s.orn == orn) s.copy(llegadaAt = at) else s
                            },
                        loading = false,
                    )
                RouteLocalNotifier.show(
                    repo.appContext,
                    title = "Cliente avisado",
                    body = "Le avisamos por WhatsApp que llegaste. Revisá el pedido y marcá entregado.",
                    type = "cliente_avisado",
                )
                onDone()
            }.onFailure {
                _ui.value = _ui.value.copy(loading = false, error = it.message)
            }
        }
    }

    /**
     * Marca entregada; el servidor devuelve la ruta actualizada (sin segundo listRuta).
     */
    fun markEntregada(orn: String, onDone: (RouteStop?) -> Unit) {
        val token = _ui.value.session?.token ?: return
        val deliveredSnapshot = stopFor(orn)
        viewModelScope.launch {
            withActionRefreshGuard {
                _ui.value = _ui.value.copy(loading = true, error = null)
                repo.markEntregada(token, orn)
            }.onSuccess { pedidos ->
                pendingEntregaRemovedOrn = orn
                deliveredSnapshot?.let { snap ->
                    val row = historialFromStop(snap)
                    _ui.value =
                        _ui.value.copy(
                            deliveryHistory = listOf(row) + _ui.value.deliveryHistory,
                        )
                }
                if (!pedidos.isNullOrEmpty()) {
                    applyStopsFromServer(token, pedidos, expectedRemovedOrns = setOf(orn))
                    val next = pickNextStop(pedidos)
                    _ui.value =
                        _ui.value.copy(
                            loading = false,
                            activeOrn = next?.orn,
                            tripStarted = next != null || _ui.value.tripStarted,
                        )
                    RepartoSessionForegroundService.setActiveOrn(
                        repo.appContext,
                        next?.orn.orEmpty(),
                    )
                    onDone(next)
                } else {
                    refreshRouteAndWait(token)
                        .onSuccess { list ->
                            val next = pickNextStop(list)
                            _ui.value =
                                _ui.value.copy(
                                    loading = false,
                                    activeOrn = next?.orn,
                                    tripStarted = next != null || _ui.value.tripStarted,
                                )
                            RepartoSessionForegroundService.setActiveOrn(
                                repo.appContext,
                                next?.orn.orEmpty(),
                            )
                            onDone(next)
                        }
                        .onFailure {
                            val next = pickNextStop(_ui.value.stops.filter { it.orn != orn })
                            _ui.value = _ui.value.copy(loading = false, activeOrn = next?.orn)
                            onDone(next)
                        }
                }
            }.onFailure {
                pendingEntregaRemovedOrn = null
                _ui.value = _ui.value.copy(loading = false, error = it.message)
            }
        }
    }

    fun stopFor(orn: String): RouteStop? = _ui.value.stops.find { it.orn == orn }

    fun nextStop(): RouteStop? = pickNextStop(_ui.value.stops)

    fun startHomeMapPreview() {
        if (_ui.value.trackingOrn != null) return
        homeMapPreviewActive = true
        _ui.value =
            _ui.value.copy(
                homeMapWaitingGps = true,
                homeMapDriver = lastKnownDriverLatLng,
            )
        viewModelScope.launch {
            val loc =
                lastKnownDriverLatLng
                    ?: withContext(Dispatchers.IO) {
                        LocationHelper.lastLatLng(repo.appContext)
                    }
            if (!homeMapPreviewActive || _ui.value.trackingOrn != null) return@launch
            if (loc != null) {
                lastKnownDriverLatLng = loc
                _ui.value =
                    _ui.value.copy(
                        homeMapDriver = loc,
                        homeMapWaitingGps = false,
                    )
            } else {
                _ui.value = _ui.value.copy(homeMapWaitingGps = false)
            }
        }
    }

    fun stopHomeMapPreview() {
        homeMapPreviewActive = false
        _ui.value = _ui.value.copy(homeMapWaitingGps = false)
    }

    fun pickNextStop(stops: List<RouteStop>): RouteStop? {
        if (stops.isEmpty()) return null
        val enCamino =
            stops.filter { it.estado.equals("en_camino", ignoreCase = true) }
        if (enCamino.isNotEmpty()) return enCamino.minByOrNull { it.parada ?: 999 }
        return stops.minByOrNull { it.parada ?: 999 }
    }

    private fun patchStopCoords(orn: String, lat: Double, lng: Double) {
        geocodeCache[orn] = Pair(lat, lng)
        _ui.value =
            _ui.value.copy(
                stops =
                    _ui.value.stops.map { s ->
                        if (s.orn == orn) s.copy(lat = lat, lng = lng) else s
                    },
            )
    }

    /** Ruta mínima km hacia esta parada (y cada recálculo); orden 1→2→3 lo define cocina. */
    fun beginNavigation(context: Context, orn: String) {
        if (_ui.value.session == null) return
        val stop = stopFor(orn) ?: return
        val gen = ++navGeneration
        _ui.value =
            _ui.value.copy(
                trackingOrn = orn,
                navLoading = true,
                navManeuver = "Ubicando dirección…",
                navEtaMinutes = null,
                navRouteKm = null,
                navMeta = "",
                navDest = null,
                navDriver = null,
            )
        viewModelScope.launch {
            val destCoords =
                resolveDestination(stop)
                    ?: run {
                        if (navStillActive(gen, orn)) {
                            _ui.value =
                                _ui.value.copy(
                                    navLoading = false,
                                    navDest = null,
                                )
                        }
                        return@launch
                    }
            if (!navStillActive(gen, orn)) return@launch
            val destLat = destCoords.first
            val destLng = destCoords.second
            patchStopCoords(orn, destLat, destLng)
            RepartoSessionForegroundService.setActiveOrn(context, orn)
            val origin =
                lastKnownDriverLatLng
                    ?: withContext(Dispatchers.IO) {
                        LocationHelper.lastLatLng(context)
                    }
                    ?: Pair(BravaConstants.KITCHEN_LAT, BravaConstants.KITCHEN_LNG)
            lastKnownDriverLatLng = origin
            _ui.value =
                _ui.value.copy(
                    navDest = destCoords,
                    navDriver = origin,
                )
            if (!navStillActive(gen, orn)) return@launch
            _ui.value =
                _ui.value.copy(
                    navLoading = false,
                    navManeuver = "",
                )
        }
    }

    private fun navStillActive(generation: Int, orn: String): Boolean =
        generation == navGeneration && _ui.value.trackingOrn == orn && stopFor(orn) != null

    /** Igual que la web: coords del pedido o geocode vía /api/address-suggest. */
    private suspend fun resolveDestination(stop: RouteStop): Pair<Double, Double>? {
        val lat = stop.lat
        val lng = stop.lng
        if (lat != null && lng != null) {
            return Pair(lat, lng)
        }
        geocodeCache[stop.orn]?.let { return it }
        val geo =
            withContext(Dispatchers.IO) {
                geocode.geocodeStop(stop)
            }
        return geo
            .onFailure { err ->
                _ui.value =
                    _ui.value.copy(
                        navManeuver = err.message ?: "No ubicamos la dirección.",
                    )
            }
            .getOrNull()
    }

    fun stopNavigation(context: Context) {
        navGeneration++
        stopNavigationQuiet()
        val keepOrn =
            _ui.value.stops
                .firstOrNull { it.estado.equals("en_camino", ignoreCase = true) }
                ?.orn
                .orEmpty()
                .ifEmpty { _ui.value.activeOrn.orEmpty() }
        RepartoSessionForegroundService.setActiveOrn(context, keepOrn)
    }

    private fun stopNavigationQuiet() {
        BravaMapboxNavigation.stopActiveGuidance()
        _ui.value =
            _ui.value.copy(
                trackingOrn = null,
                navLoading = false,
                navDest = null,
                navDriver = null,
                navMeta = "",
                navManeuver = "",
                navEtaMinutes = null,
                navRouteKm = null,
            )
    }
}

class RepartidorViewModelFactory(
    private val repo: RepartidorRepository,
    private val realtime: app.bravaburgers.repartidor.nativeapp.realtime.RepartidorRealtimeCoordinator? = null,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(RepartidorViewModel::class.java)) {
            return RepartidorViewModel(repo, realtime) as T
        }
        throw IllegalArgumentException("unknown ViewModel")
    }
}
