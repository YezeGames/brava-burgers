package app.bravaburgers.repartidor.nativeapp.mapbox

import android.util.Log
import com.mapbox.maps.EdgeInsets
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource

/**
 * Centra el puck en la banda útil (estilo Maps): padding simétrico en el viewport de navegación.
 * Búsqueda acotada (una vez) — no recorremos todo el grafo como en el fix que congelaba la app.
 */
object BravaMapboxCameraAnchor {
    private const val TAG = "BravaMapboxCamera"
    private const val MAX_NODES = 72
    private const val MAX_DEPTH = 5

    private var viewportDataSource: MapboxNavigationViewportDataSource? = null
    private var lookupAttempted = false
    private var lastTopPx = -1.0
    private var lastBottomPx = -1.0

    fun applyFollowingCenter(
        navigationView: NavigationView,
        topPx: Double,
        bottomPx: Double,
        sidePx: Double,
    ) {
        val top = topPx.coerceAtLeast(48.0)
        val bottom = bottomPx.coerceAtLeast(48.0)
        val side = sidePx.coerceAtLeast(32.0)
        if (viewportDataSource == null && !lookupAttempted) {
            lookupAttempted = true
            viewportDataSource = findViewportDataSource(navigationView)
            if (viewportDataSource == null) {
                Log.w(TAG, "ViewportDataSource not found; MapView padding only")
            }
        }
        val vds = viewportDataSource ?: return
        if (
            kotlin.math.abs(lastTopPx - top) < 2.0 &&
            kotlin.math.abs(lastBottomPx - bottom) < 2.0
        ) {
            return
        }
        lastTopPx = top
        lastBottomPx = bottom
        // Simétrico solo en el viewport de cámara (centra el puck en la banda útil), no en el MapView.
        val vertical = maxOf(top, bottom)
        val insets = EdgeInsets(vertical, side, vertical, side)
        vds.followingPadding = insets
        vds.overviewPadding = EdgeInsets(top, side, bottom, side)
        vds.followingBearingPropertyOverride(null)
        try {
            vds.evaluate()
            navigationView.post { navigationView.api.recenterCamera() }
        } catch (e: Exception) {
            Log.w(TAG, "evaluate failed: ${e.message}")
        }
    }

    fun reset() {
        viewportDataSource = null
        lookupAttempted = false
        lastTopPx = -1.0
        lastBottomPx = -1.0
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
