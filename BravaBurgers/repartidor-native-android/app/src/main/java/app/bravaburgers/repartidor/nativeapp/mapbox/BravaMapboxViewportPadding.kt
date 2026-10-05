package app.bravaburgers.repartidor.nativeapp.mapbox

import android.util.Log
import android.view.View
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.dropin.map.MapViewObserver
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource

/**
 * Ajusta el encuadre de la cámara cuando ocultamos maneuver/trip progress del drop-in
 * pero tenemos overlays Brava fuera del [NavigationView].
 */
object BravaMapboxViewportPadding {
    private const val TAG = "BravaMapboxViewport"
    private var mapViewRef: MapView? = null

    private val mapObserver =
        object : MapViewObserver() {
            override fun onAttached(mapView: MapView) {
                mapViewRef = mapView
            }

            override fun onDetached(mapView: MapView) {
                if (mapViewRef === mapView) mapViewRef = null
            }
        }

    fun register(navigationView: NavigationView) {
        navigationView.registerMapObserver(mapObserver)
    }

    fun unregister(navigationView: NavigationView) {
        navigationView.unregisterMapObserver(mapObserver)
        mapViewRef = null
    }

    fun apply(
        navigationView: NavigationView,
        topPx: Double,
        bottomPx: Double,
    ) {
        val side = 40.0
        val top = topPx.coerceAtLeast(48.0)
        val bottom = bottomPx.coerceAtLeast(72.0)
        var applied = patchViewportDataSource(navigationView, top, side, bottom, side)
        MapboxNavigationApp.current()?.let { applied = patchViewportDataSource(it, top, side, bottom, side) || applied }
        if (applied) {
            navigationView.post { navigationView.api.recenterCamera() }
        } else {
            Log.w(TAG, "ViewportDataSource not found; relying on split map layout")
        }
    }

    fun resetNorth() {
        val mapView = mapViewRef ?: return
        val mapboxMap = mapView.getMapboxMap()
        val state = mapboxMap.cameraState
        mapView.camera.easeTo(
            com.mapbox.maps.CameraOptions.Builder()
                .bearing(0.0)
                .pitch(state.pitch)
                .zoom(state.zoom)
                .center(state.center)
                .build(),
        )
    }

    private fun patchViewportDataSource(
        root: Any,
        top: Double,
        left: Double,
        bottom: Double,
        right: Double,
    ): Boolean {
        val seen = mutableSetOf<Int>()
        var found = false
        fun scan(
            obj: Any?,
            depth: Int,
        ) {
            if (obj == null || depth > 6) return
            val id = System.identityHashCode(obj)
            if (!seen.add(id)) return
            if (obj is MapboxNavigationViewportDataSource) {
                obj.followingPadding = EdgeInsets(top, left, bottom, right)
                obj.overviewPadding = EdgeInsets(top * 0.85, left, bottom * 0.85, right)
                obj.evaluate()
                found = true
                return
            }
            if (obj is View) {
                // no-op: don't walk entire view tree
            }
            for (field in obj.javaClass.declaredFields) {
                try {
                    field.isAccessible = true
                    scan(field.get(obj), depth + 1)
                    if (found) return
                } catch (_: Exception) {
                }
            }
        }
        scan(root, 0)
        return found
    }
}
