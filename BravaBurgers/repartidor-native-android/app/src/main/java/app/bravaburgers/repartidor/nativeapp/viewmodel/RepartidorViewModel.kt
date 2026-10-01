package app.bravaburgers.repartidor.nativeapp.viewmodel

import android.content.Context
import app.bravaburgers.repartidor.nativeapp.update.AppApkInstaller
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import app.bravaburgers.repartidor.nativeapp.BravaConstants
import app.bravaburgers.repartidor.nativeapp.data.GeocodeClient
import app.bravaburgers.repartidor.nativeapp.data.OsrmClient
import app.bravaburgers.repartidor.nativeapp.data.RepartidorRepository
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.data.Session
import app.bravaburgers.repartidor.nativeapp.data.RealtimeConfigDto
import app.bravaburgers.repartidor.nativeapp.location.LocationHelper
import app.bravaburgers.repartidor.nativeapp.location.NavLocationTracker
import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteGeometry
import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteProgress
import app.bravaburgers.repartidor.nativeapp.push.RouteLocalNotifier
import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteVoiceGuide
import app.bravaburgers.repartidor.nativeapp.navigation.ValhallaMapMatcher
import app.bravaburgers.repartidor.nativeapp.push.PushRegistrar
import app.bravaburgers.repartidor.nativeapp.session.RepartoSessionForegroundService
import app.bravaburgers.repartidor.nativeapp.session.RouteEvents
import app.bravaburgers.repartidor.nativeapp.session.RouteGpsSync
import app.bravaburgers.repartidor.nativeapp.session.SessionWorkScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
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
    val navRoute: List<Pair<Double, Double>> = emptyList(),
    val navManeuver: String = "Calculando ruta…",
    /** Banner superior (sin prefijo de distancia). */
    val navInstructionPrimary: String = "",
    val navInstructionThen: String? = null,
    val navInstructionThenModifier: String? = null,
    val navManeuverModifier: String? = null,
    val navSpeedKmh: Int = 0,
    val navEtaMinutes: Int? = null,
    val navRouteKm: Double? = null,
    val navMeta: String = "",
    val navLoading: Boolean = false,
    val navDest: Pair<Double, Double>? = null,
    /** Repartidor (GPS vivo) — lat,lng */
    val navDriver: Pair<Double, Double>? = null,
    val navDriverBearing: Float? = null,
    val trackingOrn: String? = null,
    val navVoiceOn: Boolean = true,
    val appUpdate: AppUpdateOffer? = null,
    val appUpdateBusy: Boolean = false,
    val appUpdateProgress: Int = 0,
    val appUpdateIndeterminate: Boolean = false,
    val appUpdateError: String? = null,
)

@OptIn(FlowPreview::class)
class RepartidorViewModel(
    private val repo: RepartidorRepository,
    private val realtime: app.bravaburgers.repartidor.nativeapp.realtime.RepartidorRealtimeCoordinator? = null,
) : ViewModel() {
    private val _ui = MutableStateFlow(RepartidorUiState())
    val ui: StateFlow<RepartidorUiState> = _ui.asStateFlow()
    private val osrm = OsrmClient()
    private val valhallaMatcher = ValhallaMapMatcher(osrm)
    private var navValhallaMatchOn = false
    private val navGpsMutex = Mutex()
    private val geocode = GeocodeClient()
    private val geocodeCache = mutableMapOf<String, Pair<Double, Double>>()
    private val navLocationTracker = NavLocationTracker(repo.appContext)
    private val navVoice = NavRouteVoiceGuide(repo.appContext)
    private val routeRefreshMutex = Mutex()
    private var loginRealtime: RealtimeConfigDto? = null
    private var bootstrappedToken: String? = null
    /** Evita listRuta extra mientras el usuario espera respuesta de una acción. */
    private var suppressBackgroundRefresh = 0
    private var lastForegroundRefreshMs = 0L
    /** Invalida refreshes en vuelo al cerrar sesión (estilo Uber: UI primero). */
    private var authEpoch = 0
    private var suppressSessionRestore = false
    private var navRerouteInFlight = false
    private var lastNavRerouteAtMs = 0L
    private var navOffRouteAnnounced = false
    /** Último fix GPS útil para arrancar OSRM sin esperar getCurrentLocation. */
    private var lastKnownDriverLatLng: Pair<Double, Double>? = null
    private var lastNavFixForBearing: Pair<Double, Double>? = null
    /** Invalida coroutines de OSRM/geocode si cambió la parada o se cerró navegación. */
    private var navGeneration = 0
    private var routeListReady = false

    private val _routeSyncEvents = MutableSharedFlow<RouteSyncEvent>(extraBufferCapacity = 4)
    val routeSyncEvents = _routeSyncEvents.asSharedFlow()

    val sessionFlow =
        repo.sessionStore.sessionFlow.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        navVoice.ensureInit()
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
                        launch { osrm.ensureBasesLoaded() }
                        launch { osrm.prefetchBravaPrimary() }
                        PushRegistrar.registerAfterLogin(ctx, repo, s.token)
                        val rt = loginRealtime
                        loginRealtime = null
                        realtime?.start(s.token, rt)
                        SessionWorkScheduler.schedule(ctx)
                        applyRefresh(s.token, pull = false, refreshing = true)
                        checkForAppUpdate()
                    } else if (_ui.value.stops.isEmpty()) {
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
        viewModelScope.launch {
            RouteEvents.refresh
                .debounce(350)
                .collect { reason ->
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
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null)
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

    fun dismissAppUpdate() {
        if (_ui.value.appUpdateBusy) return
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
                        appUpdate = null,
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

    private fun checkForAppUpdate() {
        if (_ui.value.appUpdate != null) return
        viewModelScope.launch(Dispatchers.IO) {
            val offer = AppUpdateChecker.fetchOfferIfNewer() ?: return@launch
            _ui.value = _ui.value.copy(appUpdate = offer)
        }
    }

    fun logout() {
        authEpoch++
        suppressSessionRestore = true
        bootstrappedToken = null
        routeListReady = false
        navGeneration++
        navLocationTracker.stop()
        navVoice.reset()
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

    private fun applyStopsFromServer(token: String, list: List<RouteStop>) {
        if (_ui.value.session?.token != token) return
        val previous = _ui.value.stops
        val merged =
            list.map { incoming ->
                val prev = previous.find { it.orn == incoming.orn }
                if (prev?.items.isNullOrEmpty()) incoming else incoming.copy(items = prev.items)
            }
        val newOrns = merged.map { it.orn }.toSet()
        val removed =
            if (routeListReady) {
                previous.filter { it.orn !in newOrns }
            } else {
                emptyList()
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
        viewModelScope.launch {
            withActionRefreshGuard {
                _ui.value = _ui.value.copy(loading = true, error = null)
                repo.markEntregada(token, orn)
            }.onSuccess { pedidos ->
                if (!pedidos.isNullOrEmpty()) {
                    applyStopsFromServer(token, pedidos)
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
                _ui.value = _ui.value.copy(loading = false, error = it.message)
            }
        }
    }

    fun stopFor(orn: String): RouteStop? = _ui.value.stops.find { it.orn == orn }

    fun nextStop(): RouteStop? = pickNextStop(_ui.value.stops)

    /** Primera parada pendiente: en_camino primero, si no la de menor número (como web). */
    fun pickNextStop(stops: List<RouteStop>): RouteStop? {
        if (stops.isEmpty()) return null
        val enCamino =
            stops.filter { it.estado.equals("en_camino", ignoreCase = true) }
        if (enCamino.isNotEmpty()) return enCamino.minByOrNull { it.parada ?: 999 }
        return stops.minByOrNull { it.parada ?: 999 }
    }

    private suspend fun applyNavDriverFix(
        lat: Double,
        lng: Double,
        gpsBearing: Float?,
        speedMps: Float?,
    ) {
        lastKnownDriverLatLng = Pair(lat, lng)
        val speedKmh =
            speedMps?.takeIf { it >= 0f && it >= 1.2f }?.let { (it * 3.6f).toInt().coerceIn(0, 999) }
                ?: 0

        navGpsMutex.withLock {
            commitNavDriverFix(lat, lng, gpsBearing, speedKmh)
        }
    }

    /** GPS real en mapa, voz y reruta (sin map-matching a calle). */
    private fun commitNavDriverFix(
        lat: Double,
        lng: Double,
        gpsBearing: Float?,
        speedKmh: Int,
    ) {
        val bearing = resolveNavBearing(lat, lng, gpsBearing, forDisplay = false)
        lastNavFixForBearing = Pair(lat, lng)
        val tick = navVoice.onDriverPosition(lat, lng)
        val stepIdx = tick?.stepIndex ?: 0
        _ui.value =
            _ui.value.copy(
                navDriver = Pair(lat, lng),
                navDriverBearing = bearing,
                navSpeedKmh = speedKmh,
                navManeuver = tick?.instruction ?: _ui.value.navManeuver,
                navInstructionPrimary = navVoice.bannerPrimary(stepIdx),
                navInstructionThen = navVoice.nextSignificantInstruction(stepIdx),
                navInstructionThenModifier =
                    navVoice.nextSignificantStepIndex(stepIdx)?.let {
                        navVoice.maneuverModifierAt(it)
                    },
                navManeuverModifier = navVoice.maneuverModifierAt(stepIdx),
                navMeta = appendNavTurnMeta(_ui.value.navMeta, tick),
            )
        maybeRerouteFromGps(lat, lng, speedKmh)
    }

    private fun resolveNavBearing(
        lat: Double,
        lng: Double,
        gpsBearing: Float?,
        forDisplay: Boolean,
    ): Float? {
        if (gpsBearing != null) return gpsBearing
        val prev = if (forDisplay) _ui.value.navDriver else lastNavFixForBearing
        if (prev != null) {
            val movedM = kotlin.math.abs(prev.first - lat) + kotlin.math.abs(prev.second - lng)
            if (movedM > 0.00004) {
                return NavRouteProgress.bearingDeg(prev.first, prev.second, lat, lng).toFloat()
            }
        }
        return _ui.value.navDriverBearing
    }

    private fun disableNavMapMatching() {
        navValhallaMatchOn = false
        valhallaMatcher.setEnabled(false)
        valhallaMatcher.reset()
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
                navManeuver = "Ubicando dirección en el mapa…",
                navInstructionPrimary = "Ubicando dirección…",
                navInstructionThen = null,
                navInstructionThenModifier = null,
                navManeuverModifier = null,
                navSpeedKmh = 0,
                navEtaMinutes = null,
                navRouteKm = null,
                navMeta = "",
                navRoute = emptyList(),
                navDest = null,
                navDriver = null,
            )
        navVoice.setEnabled(_ui.value.navVoiceOn)
        navRerouteInFlight = false
        lastNavRerouteAtMs = 0L
        navOffRouteAnnounced = false
        navValhallaMatchOn = false
        valhallaMatcher.setEnabled(false)
        valhallaMatcher.reset()
        navLocationTracker.start { lat, lng, gpsBearing, speedMps ->
            viewModelScope.launch {
                applyNavDriverFix(lat, lng, gpsBearing, speedMps)
            }
        }
        viewModelScope.launch {
            val destCoords =
                coroutineScope {
                    launch { osrm.ensureBasesLoaded() }
                    launch { osrm.prefetchBravaPrimary() }
                    val destJob = async { resolveDestination(stop) }
                    val fromJob =
                        async(Dispatchers.IO) {
                            lastKnownDriverLatLng
                                ?: LocationHelper.lastLatLng(context)
                                ?: Pair(BravaConstants.KITCHEN_LAT, BravaConstants.KITCHEN_LNG)
                        }
                    val fromEarly = fromJob.await()
                    if (!navStillActive(gen, orn)) return@coroutineScope null
                    lastKnownDriverLatLng = fromEarly
                    _ui.value = _ui.value.copy(navDriver = fromEarly)
                    destJob.await()
                }
                    ?: run {
                        if (navStillActive(gen, orn)) {
                            _ui.value =
                                _ui.value.copy(
                                    navLoading = false,
                                    navRoute = emptyList(),
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
            _ui.value =
                _ui.value.copy(
                    navManeuver = "Calculando ruta…",
                    navDest = destCoords,
                )
            val from = _ui.value.navDriver ?: lastKnownDriverLatLng
                ?: Pair(BravaConstants.KITCHEN_LAT, BravaConstants.KITCHEN_LNG)
            val result =
                osrm.fetchDrivingRouteFast(
                    fromLng = from.second,
                    fromLat = from.first,
                    toLng = destLng,
                    toLat = destLat,
                )
            if (!navStillActive(gen, orn)) return@launch
            result
                .onSuccess { route ->
                    val km = route.distanceM / 1000.0
                    val min = (route.durationSec / 60.0).toInt().coerceAtLeast(1)
                    disableNavMapMatching()
                    navVoice.startRoute(route, stop.parada, navArrivalContext(stop, destLat, destLng))
                    _ui.value =
                        _ui.value.copy(
                            navLoading = false,
                            navRoute = route.coordinates,
                            navManeuver = route.firstManeuver,
                            navInstructionPrimary = navVoice.bannerPrimary(0),
                            navInstructionThen = navVoice.nextSignificantInstruction(0),
                            navInstructionThenModifier =
                                navVoice.nextSignificantStepIndex(0)?.let {
                                    navVoice.maneuverModifierAt(it)
                                },
                            navManeuverModifier = navVoice.maneuverModifierAt(0),
                            navEtaMinutes = min,
                            navRouteKm = km,
                            navMeta = String.format("~%d min · %.1f km · %s", min, km, route.sourceTag),
                        )
                }
                .onFailure {
                    _ui.value =
                        _ui.value.copy(
                            navLoading = false,
                            navManeuver =
                                "No se pudo trazar la ruta por calles. Reintentá en unos segundos " +
                                    "o volvé atrás y entrá de nuevo.",
                            navRoute = emptyList(),
                        )
                }
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

    fun toggleNavVoice() {
        val on = !_ui.value.navVoiceOn
        navVoice.setEnabled(on)
        _ui.value = _ui.value.copy(navVoiceOn = on)
    }

    private fun navArrivalContext(
        stop: RouteStop,
        destLat: Double,
        destLng: Double,
    ): NavRouteVoiceGuide.ArrivalContext {
        val cliente = stop.cliente?.trim()?.takeIf { it.isNotEmpty() }
        val dir = stop.direccion?.trim()?.takeIf { it.isNotEmpty() }
        val label =
            when {
                cliente != null && dir != null -> "$cliente, $dir"
                cliente != null -> cliente
                dir != null -> dir
                else -> null
            }
        return NavRouteVoiceGuide.ArrivalContext(
            clientLabel = label,
            destLat = destLat,
            destLng = destLng,
        )
    }

    private fun appendNavTurnMeta(
        current: String,
        tick: NavRouteVoiceGuide.Tick?,
    ): String {
        val base =
            current
                .split(" · Paso ")
                .first()
                .split(" · Próx. maniobra")
                .first()
                .replace(" · Recalculando ruta…", "")
                .trim()
        if (tick == null || tick.stepCount <= 0) return base
        val stepPart = " · Paso ${tick.stepIndex + 1}/${tick.stepCount}"
        val distPart =
            tick.distanceToManeuverM?.let { d ->
                if (d > 0) " · Próx. maniobra ~$d m" else ""
            }.orEmpty()
        return (base + stepPart + distPart).trim()
    }

    private fun maybeRerouteFromGps(lat: Double, lng: Double, speedKmh: Int) {
        val state = _ui.value
        if (state.navLoading || state.trackingOrn.isNullOrBlank()) return
        val route = state.navRoute
        if (route.size < 2 || navRerouteInFlight) return
        val dest = state.navDest ?: return
        if (speedKmh < REROUTE_MIN_SPEED_KMH) {
            navOffRouteAnnounced = false
            return
        }
        val offM = NavRouteGeometry.distanceToRouteM(lat, lng, route)
        val threshold =
            if (speedKmh >= 15) {
                REROUTE_OFF_ROUTE_M_FAST
            } else {
                REROUTE_OFF_ROUTE_M
            }
        if (offM < threshold) {
            navOffRouteAnnounced = false
            return
        }
        val now = System.currentTimeMillis()
        val minInterval =
            if (speedKmh >= 10) {
                REROUTE_MIN_INTERVAL_MOVING_MS
            } else {
                REROUTE_MIN_INTERVAL_MS
            }
        if (now - lastNavRerouteAtMs < minInterval) return
        if (!navOffRouteAnnounced) {
            navOffRouteAnnounced = true
            navVoice.speakOffRoute()
        }
        rerouteFromCurrentPosition(lat, lng, dest)
    }

    private fun rerouteFromCurrentPosition(
        lat: Double,
        lng: Double,
        dest: Pair<Double, Double>,
    ) {
        navRerouteInFlight = true
        lastNavRerouteAtMs = System.currentTimeMillis()
        val prevMeta = _ui.value.navMeta
        _ui.value =
            _ui.value.copy(
                navMeta =
                    if (prevMeta.contains("Recalculando")) prevMeta
                    else "$prevMeta · Recalculando ruta…".trim().removePrefix("·").trim(),
            )
        viewModelScope.launch {
            val result =
                osrm.fetchDrivingRouteFast(
                    fromLng = lng,
                    fromLat = lat,
                    toLng = dest.second,
                    toLat = dest.first,
                )
            navRerouteInFlight = false
            result
                .onSuccess { route ->
                    val km = route.distanceM / 1000.0
                    val min = (route.durationSec / 60.0).toInt().coerceAtLeast(1)
                    disableNavMapMatching()
                    navVoice.announceReroute(route)
                    navOffRouteAnnounced = false
                    _ui.value =
                        _ui.value.copy(
                            navRoute = route.coordinates,
                            navManeuver = route.firstManeuver,
                            navInstructionPrimary = navVoice.bannerPrimary(0),
                            navInstructionThen = navVoice.nextSignificantInstruction(0),
                            navInstructionThenModifier =
                                navVoice.nextSignificantStepIndex(0)?.let {
                                    navVoice.maneuverModifierAt(it)
                                },
                            navManeuverModifier = navVoice.maneuverModifierAt(0),
                            navEtaMinutes = min,
                            navRouteKm = km,
                            navMeta = String.format("~%d min · %.1f km · %s", min, km, route.sourceTag),
                        )
                }
                .onFailure {
                    navOffRouteAnnounced = false
                    _ui.value =
                        _ui.value.copy(
                            navMeta = prevMeta.ifBlank { _ui.value.navMeta },
                        )
                }
        }
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
        navLocationTracker.stop()
        navValhallaMatchOn = false
        valhallaMatcher.setEnabled(false)
        valhallaMatcher.reset()
        navVoice.reset()
        _ui.value =
            _ui.value.copy(
                trackingOrn = null,
                navLoading = false,
                navRoute = emptyList(),
                navDest = null,
                navDriver = null,
                navDriverBearing = null,
                navMeta = "",
                navManeuver = "",
                navInstructionPrimary = "",
                navInstructionThen = null,
                navInstructionThenModifier = null,
                navManeuverModifier = null,
                navSpeedKmh = 0,
                navEtaMinutes = null,
                navRouteKm = null,
            )
    }

    override fun onCleared() {
        navVoice.shutdown()
        super.onCleared()
    }

    companion object {
        private const val REROUTE_OFF_ROUTE_M = 32.0
        private const val REROUTE_OFF_ROUTE_M_FAST = 26.0
        private const val REROUTE_MIN_SPEED_KMH = 4
        private const val REROUTE_MIN_INTERVAL_MS = 12_000L
        private const val REROUTE_MIN_INTERVAL_MOVING_MS = 5_500L
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
