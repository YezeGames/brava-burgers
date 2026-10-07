package app.bravaburgers.repartidor.nativeapp.mapbox

import com.mapbox.maps.MapView
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.dropin.map.MapViewObserver

/**
 * Mapa edge-to-edge; la cámara Brava usa [MapboxNavigationViewportDataSource.followingPadding]
 * (sin [MapView.setPadding] para overlays).
 */
object BravaMapboxViewportPadding {
    private var mapViewRef: MapView? = null

    var onMapAttached: (() -> Unit)? = null

    private val mapObserver =
        object : MapViewObserver() {
            override fun onAttached(mapView: MapView) {
                mapViewRef = mapView
                clearMapPadding()
                BravaMapboxCameraAnchor.onMapViewAttached(mapView)
                BravaMapboxNavigation.notifyMapSurfaceReady()
                onMapAttached?.invoke()
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
        onMapAttached = null
    }

    fun clearMapPadding() {
        mapViewRef?.setPadding(0, 0, 0, 0)
    }
}
