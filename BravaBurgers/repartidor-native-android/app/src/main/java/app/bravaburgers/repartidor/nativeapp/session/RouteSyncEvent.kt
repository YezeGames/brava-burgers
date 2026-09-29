package app.bravaburgers.repartidor.nativeapp.session

import app.bravaburgers.repartidor.nativeapp.data.RouteStop

/** Cambio detectado al sincronizar listRuta (paradas que ya no están en la ruta). */
data class RouteSyncEvent(
    val title: String,
    val body: String,
    val removed: List<RouteStop>,
    val nextStop: RouteStop?,
    val routeCleared: Boolean,
)
