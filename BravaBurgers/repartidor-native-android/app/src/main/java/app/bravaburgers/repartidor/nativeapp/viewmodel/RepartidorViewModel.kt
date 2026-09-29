package app.bravaburgers.repartidor.nativeapp.viewmodel

import android.content.Context
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
import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteVoiceGuide
import app.bravaburgers.repartidor.nativeapp.push.PushRegistrar
import app.bravaburgers.repartidor.nativeapp.session.RepartoSessionForegroundService
import app.bravaburgers.repartidor.nativeapp.session.RouteEvents
import app.bravaburgers.repartidor.nativeapp.session.RouteGpsSync
import app.bravaburgers.repartidor.nativeapp.session.SessionWorkScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    val navMeta: String = "",
    val navLoading: Boolean = false,
    val navDest: Pair<Double, Double>? = null,
    /** Repartidor (GPS vivo) — lat,lng */
    val navDriver: Pair<Double, Double>? = null,
    val trackingOrn: String? = null,
    val navVoiceOn: Boolean = true,
)

@OptIn(FlowPreview::class)
class RepartidorViewModel(
    private val repo: RepartidorRepository,
    private val realtime: app.bravaburgers.repartidor.nativeapp.realtime.RepartidorRealtimeCoordinator? = null,
) : ViewModel() {
    private val _ui = MutableStateFlow(RepartidorUiState())
    val ui: StateFlow<RepartidorUiState> = _ui.asStateFlow()
    private val osrm = OsrmClient()
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
    private var navRerouteInFlight = false
    private var lastNavRerouteAtMs = 0L
    private var navOffRouteAnnounced = false

    val sessionFlow =
        repo.sessionStore.sessionFlow.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        navVoice.ensureInit()
        viewModelScope.launch {
            sessionFlow.collect { s ->
                _ui.value = _ui.value.copy(session = s)
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
                        PushRegistrar.registerAfterLogin(ctx, repo, s.token)
                        val rt = loginRealtime
                        loginRealtime = null
                        realtime?.start(s.token, rt)
                        SessionWorkScheduler.schedule(ctx)
                        applyRefresh(s.token, pull = false, refreshing = false)
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
                }
                .onFailure {
                    _ui.value = _ui.value.copy(loading = false, error = it.message ?: "Error")
                }
        }
    }

    fun logout() {
        bootstrappedToken = null
        viewModelScope.launch {
            repo.logout()
            _ui.value = RepartidorUiState()
            val ctx = repo.appContext
            kotlinx.coroutines.withContext(Dispatchers.Default) {
                realtime?.stop()
                SessionWorkScheduler.cancel(ctx)
                RepartoSessionForegroundService.stopSession(ctx)
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
            if (!pull && !refreshing) {
                _ui.value = _ui.value.copy(loading = true, error = null)
            } else if (refreshing) {
                _ui.value = _ui.value.copy(refreshing = true, error = null)
            } else {
                _ui.value = _ui.value.copy(loading = true, error = null)
            }
            val result = repo.fetchRoute(token)
            result
                .onSuccess { list ->
                    applyStopsFromServer(token, list)
                }
                .onFailure {
                    _ui.value =
                        _ui.value.copy(
                            loading = false,
                            refreshing = false,
                            connected = false,
                            error = it.message,
                        )
                }
            result
        }

    private fun applyStopsFromServer(token: String, list: List<RouteStop>) {
        val merged =
            list.map { incoming ->
                val prev = _ui.value.stops.find { it.orn == incoming.orn }
                if (prev?.items.isNullOrEmpty()) incoming else incoming.copy(items = prev.items)
            }
        _ui.value =
            _ui.value.copy(
                stops = merged,
                loading = false,
                refreshing = false,
                connected = true,
                tripStarted =
                    merged.any { s ->
                        s.estado.equals("en_camino", ignoreCase = true) ||
                            s.estado.equals("en_preparacion", ignoreCase = true)
                    } &&
                        (_ui.value.tripStarted ||
                            merged.any { s -> s.estado.equals("en_camino", ignoreCase = true) }),
            )
        RouteGpsSync.syncFromStops(
            repo.appContext,
            token,
            repo.apiKey,
            merged,
            _ui.value.trackingOrn,
        )
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

    fun beginNavigation(context: Context, orn: String) {
        val session = _ui.value.session ?: return
        val stop = stopFor(orn) ?: return
        _ui.value =
            _ui.value.copy(
                trackingOrn = orn,
                navLoading = true,
                navManeuver = "Ubicando dirección en el mapa…",
                navMeta = "",
                navRoute = emptyList(),
                navDest = null,
                navDriver = null,
            )
        navVoice.setEnabled(_ui.value.navVoiceOn)
        navRerouteInFlight = false
        lastNavRerouteAtMs = 0L
        navOffRouteAnnounced = false
        navLocationTracker.start { lat, lng ->
            val maneuver = navVoice.onDriverPosition(lat, lng)
            _ui.value =
                _ui.value.copy(
                    navDriver = Pair(lat, lng),
                    navManeuver = maneuver ?: _ui.value.navManeuver,
                )
            maybeRerouteFromGps(lat, lng)
        }
        viewModelScope.launch {
            val dest =
                resolveDestination(stop)
                    ?: run {
                        _ui.value =
                            _ui.value.copy(
                                navLoading = false,
                                navRoute = emptyList(),
                                navDest = null,
                            )
                        return@launch
                    }
            val destLat = dest.first
            val destLng = dest.second
            patchStopCoords(orn, destLat, destLng)
            RepartoSessionForegroundService.setActiveOrn(context, orn)
            _ui.value =
                _ui.value.copy(
                    navManeuver = "Calculando ruta…",
                    navDest = dest,
                )
            val from =
                withContext(Dispatchers.IO) {
                    LocationHelper.lastLatLng(context)
                } ?: Pair(BravaConstants.KITCHEN_LAT, BravaConstants.KITCHEN_LNG)
            _ui.value = _ui.value.copy(navDriver = from)
            val result =
                withContext(Dispatchers.IO) {
                    osrm.fetchDrivingRoute(
                        fromLng = from.second,
                        fromLat = from.first,
                        toLng = destLng,
                        toLat = destLat,
                    )
                }
            result
                .onSuccess { route ->
                    val km = route.distanceM / 1000.0
                    val min = (route.durationSec / 60.0).toInt().coerceAtLeast(1)
                    navVoice.startRoute(route, stop.parada)
                    _ui.value =
                        _ui.value.copy(
                            navLoading = false,
                            navRoute = route.coordinates,
                            navManeuver = route.firstManeuver,
                            navMeta = String.format("~%d min · %.1f km · OSRM", min, km),
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

    private fun maybeRerouteFromGps(lat: Double, lng: Double) {
        val state = _ui.value
        if (state.navLoading || state.trackingOrn.isNullOrBlank()) return
        val route = state.navRoute
        if (route.size < 2 || navRerouteInFlight) return
        val dest = state.navDest ?: return
        val offM = NavRouteGeometry.distanceToRouteM(lat, lng, route)
        if (offM < REROUTE_OFF_ROUTE_M) {
            navOffRouteAnnounced = false
            return
        }
        val now = System.currentTimeMillis()
        if (now - lastNavRerouteAtMs < REROUTE_MIN_INTERVAL_MS) return
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
                withContext(Dispatchers.IO) {
                    osrm.fetchDrivingRoute(
                        fromLng = lng,
                        fromLat = lat,
                        toLng = dest.second,
                        toLat = dest.first,
                    )
                }
            navRerouteInFlight = false
            result
                .onSuccess { route ->
                    val km = route.distanceM / 1000.0
                    val min = (route.durationSec / 60.0).toInt().coerceAtLeast(1)
                    navVoice.announceReroute(route)
                    navOffRouteAnnounced = false
                    _ui.value =
                        _ui.value.copy(
                            navRoute = route.coordinates,
                            navManeuver = route.firstManeuver,
                            navMeta = String.format("~%d min · %.1f km · OSRM", min, km),
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
        navLocationTracker.stop()
        navVoice.reset()
        val keepOrn =
            _ui.value.stops
                .firstOrNull { it.estado.equals("en_camino", ignoreCase = true) }
                ?.orn
                .orEmpty()
        RepartoSessionForegroundService.setActiveOrn(context, keepOrn)
        _ui.value =
            _ui.value.copy(
                trackingOrn = null,
                navRoute = emptyList(),
                navDest = null,
                navDriver = null,
                navMeta = "",
            )
    }

    override fun onCleared() {
        navVoice.shutdown()
        super.onCleared()
    }

    companion object {
        private const val REROUTE_OFF_ROUTE_M = 55.0
        private const val REROUTE_MIN_INTERVAL_MS = 15_000L
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
