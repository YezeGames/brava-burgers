package app.bravaburgers.repartidor.nativeapp.mapbox

import android.util.Log
import com.mapbox.maps.EdgeInsets
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.ui.maps.camera.data.FollowingFrameOptions
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource

/**
 * Mapa full-bleed: solo [followingPadding] / [overviewPadding] en el ViewportDataSource
 * (NavigationCamera). Sin zoom fijo — el SDK ajusta zoom/pitch con velocidad y ruta.
 */
object BravaMapboxCameraAnchor {
    private const val TAG = "BravaMapboxCamera"
    private const val MAX_NODES = 128
    private const val MAX_DEPTH = 8

    /** Inclinación 3D de navegación Mapbox (rango pedido 45–60). */
    private const val DEFAULT_FOLLOWING_PITCH = 50.0

    private var viewportDataSource: MapboxNavigationViewportDataSource? = null
    private var lastTopPx = -1.0
    private var lastBottomPx = -1.0
    private var cameraProfileApplied = false

    fun applyBravaOverlayPadding(
        navigationView: NavigationView,
        topPx: Double,
        bottomPx: Double,
        sidePx: Double,
    ): Boolean {
        val top = topPx.coerceAtLeast(48.0)
        val bottom = bottomPx.coerceAtLeast(80.0)
        val side = sidePx.coerceAtLeast(24.0)
        val vds = ensureViewport(navigationView) ?: return false

        vds.followingPadding = EdgeInsets(top, side, bottom, side)
        vds.overviewPadding = EdgeInsets(top * 0.9, side, bottom * 0.9, side)
        applyMapboxFollowingProfile(vds)

        val paddingChanged =
            kotlin.math.abs(lastTopPx - top) >= 2.0 ||
                kotlin.math.abs(lastBottomPx - bottom) >= 2.0 ||
                !cameraProfileApplied
        lastTopPx = top
        lastBottomPx = bottom
        cameraProfileApplied = true

        if (!paddingChanged) return true

        try {
            vds.evaluate()
            navigationView.post { navigationView.api.recenterCamera() }
        } catch (e: Exception) {
            Log.w(TAG, "evaluate failed: ${e.message}")
        }
        return true
    }

    fun forceCameraRefresh(navigationView: NavigationView) {
        val vds = ensureViewport(navigationView) ?: return
        applyMapboxFollowingProfile(vds)
        try {
            vds.evaluate()
            navigationView.post { navigationView.api.recenterCamera() }
        } catch (_: Exception) {
        }
    }

    private fun applyMapboxFollowingProfile(vds: MapboxNavigationViewportDataSource) {
        vds.options.followingFrameOptions.apply {
            defaultPitch = DEFAULT_FOLLOWING_PITCH
            // Puck en el tercio inferior del área útil (encima del panel Brava).
            focalPoint = FollowingFrameOptions.FocalPoint(0.5, 0.78)
            maximizeViewableGeometryWhenPitchZero = false
            // Zoom dinámico del SDK (velocidad + geometría); solo techo razonable.
            maxZoom = 17.5
            minZoom = 11.0
        }
        // Quitar overrides viejos (zoom estático 13.x / pitch 0).
        vds.followingPitchPropertyOverride(null)
        vds.followingZoomPropertyOverride(null)
        vds.followingBearingPropertyOverride(null)
    }

    fun invalidatePaddingCache() {
        lastTopPx = -1.0
        lastBottomPx = -1.0
        cameraProfileApplied = false
    }

    fun reset() {
        viewportDataSource = null
        lastTopPx = -1.0
        lastBottomPx = -1.0
        cameraProfileApplied = false
    }

    fun retryViewportBinding(navigationView: NavigationView) {
        if (viewportDataSource != null) return
        viewportDataSource = findViewportDataSource(navigationView)
        if (viewportDataSource == null) {
            MapboxNavigationApp.current()?.let { nav ->
                viewportDataSource = findViewportDataSource(nav)
            }
        }
        if (viewportDataSource != null) {
            Log.i(TAG, "ViewportDataSource bound on retry")
        }
    }

    private fun ensureViewport(navigationView: NavigationView): MapboxNavigationViewportDataSource? {
        viewportDataSource?.let { return it }
        viewportDataSource = findViewportDataSource(navigationView)
        if (viewportDataSource == null) {
            MapboxNavigationApp.current()?.let { nav ->
                viewportDataSource = findViewportDataSource(nav)
            }
        }
        if (viewportDataSource == null) {
            Log.w(TAG, "ViewportDataSource not ready — map full screen pero cámara sin padding Brava")
        }
        return viewportDataSource
    }

    private fun findViewportDataSource(root: Any): MapboxNavigationViewportDataSource? {
        val queue = ArrayDeque<Pair<Any, Int>>()
        val seen = mutableSetOf<Int>()
        queue.add(root to 0)
        var nodes = 0
        while (queue.isNotEmpty() && nodes < MAX_NODES) {
            val (obj, depth) = queue.removeFirst()
            val id = System.identityHashCode(obj)
            if (!seen.add(id)) continue
            nodes++
            if (obj is MapboxNavigationViewportDataSource) return obj
            if (depth >= MAX_DEPTH) continue
            for (field in obj.javaClass.declaredFields) {
                try {
                    field.isAccessible = true
                    val child = field.get(obj) ?: continue
                    if (child is MapboxNavigationViewportDataSource) return child
                    val name = child.javaClass.name
                    if (
                        name.startsWith("com.mapbox.") ||
                        name.startsWith("android.view.") ||
                        name.startsWith("androidx.")
                    ) {
                        queue.add(child to depth + 1)
                    }
                } catch (_: Exception) {
                }
            }
        }
        return null
    }
}
