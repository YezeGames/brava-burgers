package app.bravaburgers.repartidor.nativeapp.session

import android.content.Context
import app.bravaburgers.repartidor.nativeapp.data.RouteStop

/** Alinea FGS GPS con lo que dice el servidor (parada en_camino). */
object RouteGpsSync {
    fun syncFromStops(
        context: Context,
        repartidorToken: String,
        apiKey: String?,
        stops: List<RouteStop>,
        trackingOrn: String?,
    ) {
        val enCamino =
            stops
                .filter { it.estado.equals("en_camino", ignoreCase = true) }
                .minByOrNull { it.parada ?: 999 }
        val serverOrn = enCamino?.orn?.trim().orEmpty()
        when {
            serverOrn.isNotEmpty() ->
                RepartoSessionForegroundService.persistSession(context, repartidorToken, apiKey, serverOrn)
            trackingOrn.isNullOrBlank() ->
                RepartoSessionForegroundService.setActiveOrn(context, "")
        }
    }
}
