package app.bravaburgers.repartidor.nativeapp.mapbox

import com.mapbox.maps.MapView
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.dropin.map.MapViewObserver

/**
 * Padding del mapa con [MapView.setPadding] — sin reflexión ni [NavigationCamera.resetFrame]
 * (el escaneo del árbol Mapbox congelaba la app en el hilo principal).
 */
object BravaMapboxViewportPadding {
    private var mapViewRef: MapView? = null
    private var lastBottomPx = 0
    private var lastTopPx = 0

    private val mapObserver =
        object : MapViewObserver() {
            override fun onAttached(mapView: MapView) {
                mapViewRef = mapView
                applyStoredPadding()
                BravaMapboxNavigation.notifyMapSurfaceReady()
            }

            override fun onDetached(mapView: MapView) {
                if (mapViewRef === mapView) {
                    mapViewRef = null
                    BravaMapboxNavigation.notifyMapSurfaceDetached()
                }
            }
        }

    fun register(navigationView: NavigationView) {
        navigationView.registerMapObserver(mapObserver)
    }

    fun unregister(navigationView: NavigationView) {
        navigationView.unregisterMapObserver(mapObserver)
        mapViewRef = null
        lastBottomPx = 0
        lastTopPx = 0
    }

    fun applyContentInsets(
        topPx: Int,
        bottomPx: Int,
        sidePx: Int = 0,
    ) {
        lastTopPx = topPx.coerceAtLeast(0)
        lastBottomPx = bottomPx.coerceAtLeast(0)
        val side = sidePx.coerceAtLeast(0)
        mapViewRef?.setPadding(side, lastTopPx, side, lastBottomPx)
    }

    private fun applyStoredPadding() {
        mapViewRef?.setPadding(0, lastTopPx, 0, lastBottomPx)
    }
}
