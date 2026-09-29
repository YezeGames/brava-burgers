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
import app.bravaburgers.repartidor.nativeapp.location.LocationHelper
import app.bravaburgers.repartidor.nativeapp.location.NavLocationTracker
import app.bravaburgers.repartidor.nativeapp.location.TrackForegroundService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

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
)

class RepartidorViewModel(private val repo: RepartidorRepository) : ViewModel() {
    private val _ui = MutableStateFlow(RepartidorUiState())
    val ui: StateFlow<RepartidorUiState> = _ui.asStateFlow()
    private val osrm = OsrmClient()
    private val geocode = GeocodeClient()
    private val geocodeCache = mutableMapOf<String, Pair<Double, Double>>()
    private val navLocationTracker = NavLocationTracker(repo.appContext)

    val sessionFlow =
        repo.sessionStore.sessionFlow.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        viewModelScope.launch {
            sessionFlow.collect { s ->
                _ui.value = _ui.value.copy(session = s)
                if (s != null && _ui.value.stops.isEmpty()) refreshRoute(s.token, pull = false)
            }
        }
    }

    fun login(login: String, password: String) {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null)
            repo.login(login, password)
                .onSuccess {
                    _ui.value = _ui.value.copy(loading = false, session = it)
                    refreshRoute(it.token, pull = false)
                }
                .onFailure {
                    _ui.value = _ui.value.copy(loading = false, error = it.message ?: "Error")
                }
        }
    }

    fun logout() {
        viewModelScope.launch {
            repo.logout()
            _ui.value = RepartidorUiState()
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

    /** Refresca ruta y espera respuesta (p. ej. tras entregar, antes de ir a la siguiente parada). */
    private suspend fun refreshRouteAndWait(token: String): Result<List<RouteStop>> {
        _ui.value = _ui.value.copy(loading = true, error = null)
        return applyRefresh(token, pull = false, refreshing = false)
    }

    private suspend fun applyRefresh(
        token: String,
        pull: Boolean,
        refreshing: Boolean,
    ): Result<List<RouteStop>> {
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
                _ui.value =
                    _ui.value.copy(
                        stops = list,
                        loading = false,
                        refreshing = false,
                        connected = true,
                        tripStarted = _ui.value.tripStarted || list.any { s ->
                            s.estado.equals("en_camino", ignoreCase = true)
                        },
                    )
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
        return result
    }

    fun iniciarRecorrido(onDone: (RouteStop?) -> Unit) {
        val token = _ui.value.session?.token ?: return
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null)
            repo.iniciarRecorrido(token)
                .onSuccess {
                    _ui.value = _ui.value.copy(tripStarted = true)
                    refreshRouteAndWait(token)
                        .onSuccess { list ->
                            val next = pickNextStop(list)
                            _ui.value =
                                _ui.value.copy(
                                    activeOrn = next?.orn,
                                    loading = false,
                                )
                            onDone(next)
                        }
                        .onFailure {
                            _ui.value = _ui.value.copy(loading = false)
                            onDone(pickNextStop(_ui.value.stops))
                        }
                }
                .onFailure {
                    _ui.value = _ui.value.copy(loading = false, error = it.message)
                }
        }
    }

    fun setActiveOrn(orn: String) {
        _ui.value = _ui.value.copy(activeOrn = orn)
    }

    fun confirmarLlegada(orn: String, onDone: () -> Unit) {
        val token = _ui.value.session?.token ?: return
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null)
            repo.confirmarLlegada(token, orn)
                .onSuccess {
                    refreshRouteAndWait(token)
                    _ui.value = _ui.value.copy(loading = false)
                    onDone()
                }
                .onFailure {
                    _ui.value = _ui.value.copy(loading = false, error = it.message)
                }
        }
    }

    /**
     * Marca entregada, refresca ruta (servidor activa siguiente parada) y devuelve la siguiente entrega.
     */
    fun markEntregada(orn: String, onDone: (RouteStop?) -> Unit) {
        val token = _ui.value.session?.token ?: return
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null)
            repo.markEntregada(token, orn)
                .onSuccess {
                    refreshRouteAndWait(token)
                        .onSuccess { list ->
                            val next = pickNextStop(list)
                            _ui.value =
                                _ui.value.copy(
                                    loading = false,
                                    activeOrn = next?.orn,
                                    tripStarted = next != null || _ui.value.tripStarted,
                                )
                            onDone(next)
                        }
                        .onFailure {
                            val next = pickNextStop(_ui.value.stops.filter { it.orn != orn })
                            _ui.value = _ui.value.copy(loading = false, activeOrn = next?.orn)
                            onDone(next)
                        }
                }
                .onFailure {
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
        navLocationTracker.start { lat, lng ->
            _ui.value = _ui.value.copy(navDriver = Pair(lat, lng))
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
            if (LocationHelper.hasLocationPermission(context)) {
                TrackForegroundService.start(context, session.token, repo.apiKey, orn)
            }
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
            result.onSuccess { route ->
                val km = route.distanceM / 1000.0
                val min = (route.durationSec / 60.0).toInt().coerceAtLeast(1)
                val prefix = if (route.estimated) "Estimado · " else ""
                _ui.value =
                    _ui.value.copy(
                        navLoading = false,
                        navRoute = route.coordinates,
                        navManeuver = route.firstManeuver,
                        navMeta = String.format("%s~%d min · %.1f km", prefix, min, km),
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

    fun stopNavigation(context: Context) {
        navLocationTracker.stop()
        TrackForegroundService.stop(context)
        _ui.value =
            _ui.value.copy(
                trackingOrn = null,
                navRoute = emptyList(),
                navDest = null,
                navDriver = null,
                navMeta = "",
            )
    }
}

class RepartidorViewModelFactory(private val repo: RepartidorRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(RepartidorViewModel::class.java)) {
            return RepartidorViewModel(repo) as T
        }
        throw IllegalArgumentException("unknown ViewModel")
    }
}
