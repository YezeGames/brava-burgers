package app.bravaburgers.repartidor.nativeapp.mapbox

import android.os.SystemClock
import android.util.Log
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.MapView
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.dropin.map.MapViewObserver
import com.mapbox.navigation.ui.maps.camera.NavigationCamera
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import com.mapbox.navigation.ui.maps.camera.transition.NavigationCameraTransitionOptions

/**
 * Padding de cámara + recentrado en modo following.
 */
object BravaMapboxViewportPadding {
    private const val TAG = "BravaMapboxViewport"
    private const val APPLY_DEBOUNCE_MS = 120L

    private var mapViewRef: MapView? = null
    private var viewportDataSource: MapboxNavigationViewportDataSource? = null
    private var navigationCamera: NavigationCamera? = null
    private var lastNavigationView: NavigationView? = null
    private var cameraLookupDone = false
    private var lastApplyAt = 0L

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
        if (lastNavigationView === navigationView) {
            lastNavigationView = null
        }
        mapViewRef = null
        clearCameraCache()
    }

    fun apply(
        navigationView: NavigationView,
        topPx: Double,
        bottomPx: Double,
        leftPx: Double = 48.0,
        rightPx: Double = 48.0,
    ) {
        val now = SystemClock.uptimeMillis()
        if (now - lastApplyAt < APPLY_DEBOUNCE_MS) return
        lastApplyAt = now

        lastNavigationView = navigationView
        if (!cameraLookupDone) {
            ensureCameraChain(navigationView)
            MapboxNavigationApp.current()?.let { ensureCameraChain(it) }
            cameraLookupDone = viewportDataSource != null && navigationCamera != null
        }

        val top = topPx.coerceAtLeast(40.0)
        val bottom = bottomPx.coerceAtLeast(40.0)
        val left = leftPx.coerceAtLeast(32.0)
        val right = rightPx.coerceAtLeast(32.0)

        val vds = viewportDataSource
        if (vds == null) {
            Log.w(TAG, "ViewportDataSource not found; split layout only")
            return
        }

        vds.followingPadding = EdgeInsets(top, left, bottom, right)
        vds.overviewPadding = EdgeInsets(top * 0.9, left, bottom * 0.9, right)
        vds.evaluate()
        snapCameraToFrame()
    }

    fun recenterFollowing() {
        viewportDataSource?.followingBearingPropertyOverride(null)
        viewportDataSource?.evaluate()
        snapCameraToFrame()
    }

    fun resetNorthUp() {
        val vds = viewportDataSource ?: return
        vds.followingBearingPropertyOverride(0.0)
        vds.evaluate()
        snapCameraToFrame()
    }

    private fun snapCameraToFrame() {
        val camera = navigationCamera ?: return
        try {
            camera.resetFrame()
        } catch (e: Exception) {
            Log.w(TAG, "resetFrame failed: ${e.message}")
            try {
                camera.requestNavigationCameraToFollowing(
                    NavigationCameraTransitionOptions.Builder().maxDuration(0).build(),
                    NavigationCameraTransitionOptions.Builder().maxDuration(0).build(),
                )
            } catch (_: Exception) {
            }
        }
    }

    private fun clearCameraCache() {
        viewportDataSource = null
        navigationCamera = null
        cameraLookupDone = false
    }

    private fun ensureCameraChain(root: Any) {
        if (viewportDataSource != null && navigationCamera != null) return
        val seen = mutableSetOf<Int>()
        fun scan(
            obj: Any?,
            depth: Int,
        ) {
            if (obj == null || depth > 8) return
            val id = System.identityHashCode(obj)
            if (!seen.add(id)) return
            when (obj) {
                is MapboxNavigationViewportDataSource -> viewportDataSource = obj
                is NavigationCamera -> navigationCamera = obj
            }
            if (viewportDataSource != null && navigationCamera != null) return
            for (field in obj.javaClass.declaredFields) {
                try {
                    field.isAccessible = true
                    scan(field.get(obj), depth + 1)
                    if (viewportDataSource != null && navigationCamera != null) return
                } catch (_: Exception) {
                }
            }
        }
        scan(root, 0)
    }
}
