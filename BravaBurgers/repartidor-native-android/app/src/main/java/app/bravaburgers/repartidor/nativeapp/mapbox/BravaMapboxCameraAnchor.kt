package app.bravaburgers.repartidor.nativeapp.mapbox

import android.util.Log
import com.mapbox.maps.EdgeInsets
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.ui.maps.camera.data.FollowingFrameOptions
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource

/**
 * Mapbox Navigation por defecto + mapa plano. [followingPadding] evita que el puck quede bajo UI Brava.
 */
object BravaMapboxCameraAnchor {
    private const val TAG = "BravaMapboxCamera"
    private const val MAX_NODES = 96
    private const val MAX_DEPTH = 6

    private var viewportDataSource: MapboxNavigationViewportDataSource? = null
    private var lastTopPx = -1.0
    private var lastBottomPx = -1.0

    /** @return true si se aplicó al viewport de navegación Mapbox */
    fun applyBravaOverlayPadding(
        navigationView: NavigationView,
        topPx: Double,
        bottomPx: Double,
        sidePx: Double,
    ): Boolean {
        val top = topPx.coerceAtLeast(48.0)
        val bottom = bottomPx.coerceAtLeast(48.0)
        val side = sidePx.coerceAtLeast(32.0)
        val vds = ensureViewport(navigationView) ?: return false
        if (
            kotlin.math.abs(lastTopPx - top) < 2.0 &&
            kotlin.math.abs(lastBottomPx - bottom) < 2.0
        ) {
            return true
        }
        lastTopPx = top
        lastBottomPx = bottom

        vds.followingPadding = EdgeInsets(top, side, bottom, side)
        vds.overviewPadding = EdgeInsets(top * 0.85, side, bottom * 0.85, side)
        vds.options.followingFrameOptions.apply {
            defaultPitch = 0.0
            focalPoint = FollowingFrameOptions.FocalPoint(0.5, 0.82)
            maximizeViewableGeometryWhenPitchZero = false
            maxZoom = 15.4
        }
        vds.followingPitchPropertyOverride(0.0)
        vds.followingBearingPropertyOverride(null)

        try {
            vds.evaluate()
            navigationView.post { navigationView.api.recenterCamera() }
        } catch (e: Exception) {
            Log.w(TAG, "evaluate failed: ${e.message}")
        }
        return true
    }

    fun invalidatePaddingCache() {
        lastTopPx = -1.0
        lastBottomPx = -1.0
    }

    fun reset() {
        viewportDataSource = null
        lastTopPx = -1.0
        lastBottomPx = -1.0
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
            Log.w(TAG, "ViewportDataSource not ready")
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
