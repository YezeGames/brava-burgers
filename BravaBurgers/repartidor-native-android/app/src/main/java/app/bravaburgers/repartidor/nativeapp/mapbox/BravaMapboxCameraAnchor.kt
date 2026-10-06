package app.bravaburgers.repartidor.nativeapp.mapbox

import android.util.Log
import com.mapbox.maps.EdgeInsets
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.ui.maps.camera.data.FollowingFrameOptions
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource

/**
 * Cámara al estilo Mapbox para apps con UI propia (delivery / reparto).
 *
 * Docs: https://docs.mapbox.com/android/navigation/guides/ui-components/camera/
 *
 * - [MapboxNavigationViewportDataSource.followingPadding] reserva espacio para maniobras (arriba) y panel ETA (abajo).
 * - Por defecto Mapbox usa focal (0.5, **1.0**) → puck **abajo** (comportamiento turn-by-turn clásico).
 * - Para puck **centrado** en la banda útil: focal (0.5, 0.5) y desactivar
 *   [FollowingFrameOptions.maximizeViewableGeometryWhenPitchZero] (si no, con pitch 0 la cámara
 *   persigue la geometría de la ruta y “salta” tras giros hasta que recalcula).
 */
object BravaMapboxCameraAnchor {
    private const val TAG = "BravaMapboxCamera"
    private const val MAX_NODES = 72
    private const val MAX_DEPTH = 5

    private var viewportDataSource: MapboxNavigationViewportDataSource? = null
    private var lookupAttempted = false
    private var lastTopPx = -1.0
    private var lastBottomPx = -1.0

    fun applyDeliveryFrame(
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
                Log.w(TAG, "ViewportDataSource not found")
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

        vds.followingPadding = EdgeInsets(top, side, bottom, side)
        vds.overviewPadding = EdgeInsets(top * 0.9, side, bottom * 0.9, side)

        vds.options.followingFrameOptions.apply {
            focalPoint = FollowingFrameOptions.FocalPoint(0.5, 0.5)
            maximizeViewableGeometryWhenPitchZero = false
            defaultPitch = 0.0
        }
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
