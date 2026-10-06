package app.bravaburgers.repartidor.nativeapp.mapbox

import android.util.Log
import com.mapbox.maps.EdgeInsets
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.ui.maps.camera.data.FollowingFrameOptions
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource

/** Mapa plano + zoom abierto tipo delivery (DiDi), padding para UI Brava. */
object BravaMapboxCameraAnchor {
    private const val TAG = "BravaMapboxCamera"
    private const val MAX_NODES = 96
    private const val MAX_DEPTH = 6

    /** Zoom abierto tipo DiDi (varias cuadras / ~800 m visibles), plano. */
    private const val DELIVERY_FOLLOWING_ZOOM = 13.15

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
        val bottom = bottomPx.coerceAtLeast(48.0)
        val side = sidePx.coerceAtLeast(32.0)
        val vds = ensureViewport(navigationView) ?: return false

        vds.followingPadding = EdgeInsets(top, side, bottom, side)
        vds.overviewPadding = EdgeInsets(top * 0.85, side, bottom * 0.85, side)
        applyDidiFlatProfile(vds)

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
        applyDidiFlatProfile(vds)
        try {
            vds.evaluate()
            navigationView.post { navigationView.api.recenterCamera() }
        } catch (_: Exception) {
        }
    }

    private fun applyDidiFlatProfile(vds: MapboxNavigationViewportDataSource) {
        vds.options.followingFrameOptions.apply {
            defaultPitch = 0.0
            focalPoint = FollowingFrameOptions.FocalPoint(0.5, 0.80)
            maximizeViewableGeometryWhenPitchZero = false
            maxZoom = DELIVERY_FOLLOWING_ZOOM
            minZoom = 11.0
        }
        vds.followingPitchPropertyOverride(0.0)
        vds.followingZoomPropertyOverride(DELIVERY_FOLLOWING_ZOOM)
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

    /** Reintenta enlazar viewport cuando el mapa ya está montado (drop-in tarda en crear el VDS). */
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
