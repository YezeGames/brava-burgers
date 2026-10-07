package app.bravaburgers.repartidor.nativeapp.mapbox

import android.util.Log
import com.mapbox.maps.EdgeInsets
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.ui.maps.camera.data.FollowingFrameOptions
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource

/**
 * Vista plana (desde arriba) + padding UI Brava. Zoom dinámico Mapbox; sin encuadre agresivo en giros.
 */
object BravaMapboxCameraAnchor {
    private const val TAG = "BravaMapboxCamera"
    private const val MAX_NODES = 160
    private const val MAX_DEPTH = 10

    private var viewportDataSource: MapboxNavigationViewportDataSource? = null
    private var lastTopPx = -1.0
    private var lastBottomPx = -1.0
    private var flatProfileApplied = false

    fun isViewportBound(): Boolean = viewportDataSource != null

    fun applyBravaOverlayPadding(
        navigationView: NavigationView,
        topPx: Double,
        bottomPx: Double,
        sidePx: Double,
    ): Boolean {
        val top = topPx.coerceAtLeast(48.0)
        val bottom = bottomPx.coerceAtLeast(96.0)
        val side = sidePx.coerceAtLeast(24.0)
        val vds = ensureViewport(navigationView) ?: return false

        applyFlatFollowingProfile(vds)

        vds.followingPadding = EdgeInsets(top, side, bottom, side)
        vds.overviewPadding = EdgeInsets(top * 0.9, side, bottom * 0.9, side)

        val paddingChanged =
            kotlin.math.abs(lastTopPx - top) >= 2.0 ||
                kotlin.math.abs(lastBottomPx - bottom) >= 2.0 ||
                !flatProfileApplied
        lastTopPx = top
        lastBottomPx = bottom
        flatProfileApplied = true

        if (!paddingChanged) return true

        try {
            vds.evaluate()
        } catch (e: Exception) {
            Log.w(TAG, "evaluate failed: ${e.message}")
        }
        return true
    }

    private fun applyFlatFollowingProfile(vds: MapboxNavigationViewportDataSource) {
        vds.options.followingFrameOptions.apply {
            defaultPitch = 0.0
            focalPoint = FollowingFrameOptions.FocalPoint(0.5, 0.68)
            maximizeViewableGeometryWhenPitchZero = false
        }
        vds.followingPitchPropertyOverride(0.0)
        vds.followingZoomPropertyOverride(null)
        vds.followingBearingPropertyOverride(null)
    }

    fun invalidatePaddingCache() {
        lastTopPx = -1.0
        lastBottomPx = -1.0
        flatProfileApplied = false
    }

    fun reset() {
        viewportDataSource = null
        lastTopPx = -1.0
        lastBottomPx = -1.0
        flatProfileApplied = false
    }

    fun bindFromMapboxNavigation(mapboxNavigation: MapboxNavigation) {
        if (viewportDataSource != null) return
        viewportDataSource = findViewportDataSource(mapboxNavigation)
        if (viewportDataSource != null) {
            Log.i(TAG, "ViewportDataSource bound (flat 2D + Brava padding)")
        }
    }

    fun retryViewportBinding(navigationView: NavigationView) {
        if (viewportDataSource != null) return
        viewportDataSource = findViewportDataSource(navigationView)
        MapboxNavigationApp.current()?.let { bindFromMapboxNavigation(it) }
        if (viewportDataSource == null) {
            Log.w(TAG, "ViewportDataSource not bound")
        }
    }

    private fun ensureViewport(navigationView: NavigationView): MapboxNavigationViewportDataSource? {
        if (viewportDataSource == null) {
            MapboxNavigationApp.current()?.let { bindFromMapboxNavigation(it) }
        }
        if (viewportDataSource == null) {
            viewportDataSource = findViewportDataSource(navigationView)
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
