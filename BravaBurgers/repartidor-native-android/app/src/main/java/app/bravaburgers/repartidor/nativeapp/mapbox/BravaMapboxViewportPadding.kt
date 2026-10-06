package app.bravaburgers.repartidor.nativeapp.mapbox

import com.mapbox.maps.MapView
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.dropin.map.MapViewObserver

/**
 * El mapa va **edge-to-edge** (sin [MapView.setPadding] para UI Brava).
 * El margen lo define [BravaMapboxCameraAnchor] vía `followingPadding` del NavigationCamera.
 */
object BravaMapboxViewportPadding {
    private var mapViewRef: MapView? = null

    /** Cuando el mapa está listo, reintentar viewport + insets de cámara. */
    var onMapAttached: (() -> Unit)? = null

    private val mapObserver =
        object : MapViewObserver() {
            override fun onAttached(mapView: MapView) {
                mapViewRef = mapView
                clearMapPadding()
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
