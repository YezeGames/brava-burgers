package app.bravaburgers.repartidor.nativeapp.mapbox

import android.util.Log
import com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.replay.route.ReplayRouteMapper
import com.mapbox.navigation.core.replay.route.ReplayRouteOptions

/**
 * Reproduce la ruta activa con [MapboxReplayer] (pruebas de cámara sin GPS real).
 * Solo para builds DEBUG desde la pantalla de entrega.
 */
@OptIn(ExperimentalPreviewMapboxNavigationAPI::class)
object BravaMapboxRouteSimulation {
    private const val TAG = "BravaRouteSim"

    @Volatile
    var isSimulating: Boolean = false
        private set

    private val replayRouteMapper =
        ReplayRouteMapper(
            ReplayRouteOptions.Builder().build(),
        )

    /** Inicia o reinicia la simulación sobre la ruta ya cargada en Mapbox. */
    fun startOrRestartSimulation(): Boolean {
        val nav = MapboxNavigationApp.current() ?: return false
        val routes = nav.getNavigationRoutes()
        if (routes.isEmpty()) {
            Log.w(TAG, "No routes to simulate")
            return false
        }
        val directionsRoute = routes.first().directionsRoute
        return try {
            nav.stopTripSession()
            nav.startReplayTripSession(withForegroundService = false)
            with(nav.mapboxReplayer) {
                stop()
                clearEvents()
                val replayData = replayRouteMapper.mapDirectionsRouteGeometry(directionsRoute)
                if (replayData.isEmpty()) {
                    Log.e(TAG, "Empty replay events")
                    return false
                }
                pushEvents(replayData)
                seekTo(replayData.first())
                play()
            }
            isSimulating = true
            BravaMapboxCameraAnchor.recenterFollowing()
            Log.i(TAG, "Route simulation started")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Simulation failed", e)
            isSimulating = false
            false
        }
    }

    fun stopSimulation() {
        val nav = MapboxNavigationApp.current() ?: run {
            isSimulating = false
            return
        }
        try {
            nav.mapboxReplayer.stop()
            nav.mapboxReplayer.clearEvents()
            nav.stopTripSession()
            if (nav.getNavigationRoutes().isNotEmpty()) {
                nav.startTripSession(withForegroundService = false)
            }
        } catch (e: Exception) {
            Log.w(TAG, "stopSimulation: ${e.message}")
        }
        isSimulating = false
    }
}
