package app.bravaburgers.repartidor.nativeapp.mapbox

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mapbox.maps.EdgeInsets
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.ui.maps.camera.data.FollowingFrameOptions
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import java.lang.ref.WeakReference
import java.util.ArrayDeque

/**
 * Mapa plano 2D: puck estable, bearing congelado al norte (0°), sin encuadre de geometría en giros.
 * Único ajuste sobre Mapbox: [followingPadding] para UI Brava.
 */
object BravaMapboxCameraAnchor {
    private const val TAG = "BravaMapboxCamera"
    private const val MAX_NODES = 320
    private const val MAX_DEPTH = 18
    private const val MAX_BIND_ATTEMPTS = 28
    /** Mapa siempre al norte; el puck rota con la ubicación. */
    private const val FROZEN_MAP_BEARING = 0.0

    private val bindHandler = Handler(Looper.getMainLooper())
    private var bindRetryRunnable: Runnable? = null
    private var bindAttempt = 0
    private var pendingNavViewRef: WeakReference<NavigationView>? = null
    private var onViewportBoundCallback: (() -> Unit)? = null

    private var viewportDataSource: MapboxNavigationViewportDataSource? = null
    private var lastTopPx = -1.0
    private var lastBottomPx = -1.0

    private val puckFramingStrategy = BravaPuckCenterFramingStrategy()

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
        val vSym = kotlin.math.max(top, bottom)
        val vds = ensureViewport(navigationView) ?: return false

        applyFlatPuckCenteredProfile(vds)

        vds.followingPadding = EdgeInsets(vSym, side, vSym, side)
        vds.overviewPadding = EdgeInsets(vSym * 0.9, side, vSym * 0.9, side)

        lastTopPx = top
        lastBottomPx = bottom

        try {
            vds.evaluate()
        } catch (e: Exception) {
            Log.w(TAG, "evaluate failed: ${e.message}")
        }
        return true
    }

    /**
     * Re-aplica pitch 0, bearing norte y perfil plano en cada tick de ruta
     * (Mapbox a veces restaura pitch ~45 o bearing de ruta en curvas).
     */
    fun maintainFlatFollowing(navigationView: NavigationView) {
        val vds = viewportDataSource ?: attemptViewportBind(navigationView) ?: return
        applyFlatPuckCenteredProfile(vds)
        vds.followingBearingPropertyOverride(FROZEN_MAP_BEARING)
    }

    private fun applyFlatPuckCenteredProfile(vds: MapboxNavigationViewportDataSource) {
        vds.options.followingFrameOptions.apply {
            defaultPitch = 0.0
            focalPoint = FollowingFrameOptions.FocalPoint(0.5, 0.5)
            maximizeViewableGeometryWhenPitchZero = false
            pitchNearManeuvers.enabled = false
            frameGeometryAfterManeuver.enabled = false
            intersectionDensityCalculation.enabled = false
            framingStrategy = puckFramingStrategy
        }
        vds.followingPitchPropertyOverride(0.0)
        vds.followingZoomPropertyOverride(null)
        vds.followingBearingPropertyOverride(FROZEN_MAP_BEARING)
    }

    fun invalidatePaddingCache() {
        lastTopPx = -1.0
        lastBottomPx = -1.0
    }

    fun reset() {
        cancelViewportBindingRetries()
        viewportDataSource = null
        lastTopPx = -1.0
        lastBottomPx = -1.0
        onViewportBoundCallback = null
        pendingNavViewRef = null
    }

    /** Solo al iniciar guidance: el drop-in puede recrear el viewport interno. */
    fun resetBinding() {
        cancelViewportBindingRetries()
        viewportDataSource = null
    }

    fun bindFromMapboxNavigation(mapboxNavigation: MapboxNavigation) {
        if (viewportDataSource != null) return
        viewportDataSource = findViewportDataSource(mapboxNavigation)
        if (viewportDataSource != null) {
            Log.i(TAG, "ViewportDataSource bound via MapboxNavigation")
            onViewportBoundSuccess()
        }
    }

    /** Un intento inmediato (sin cola de reintentos). */
    fun retryViewportBinding(navigationView: NavigationView) {
        if (viewportDataSource != null) return
        attemptViewportBind(navigationView)
        if (viewportDataSource == null) {
            Log.w(TAG, "ViewportDataSource NOT bound (single attempt)")
        }
    }

    /**
     * Reintenta hasta enlazar [MapboxNavigationViewportDataSource] o agotar intentos.
     * [onBound] se invoca una vez en el hilo UI cuando el hook tiene éxito.
     */
    fun scheduleViewportBindingUntilBound(
        navigationView: NavigationView,
        onBound: (() -> Unit)? = null,
    ) {
        if (viewportDataSource != null) {
            onBound?.invoke()
            return
        }
        pendingNavViewRef = WeakReference(navigationView)
        if (onBound != null) {
            onViewportBoundCallback = onBound
        }
        cancelViewportBindingRetries()
        bindAttempt = 0
        scheduleNextBindAttempt(0L)
    }

    fun cancelViewportBindingRetries() {
        bindRetryRunnable?.let { bindHandler.removeCallbacks(it) }
        bindRetryRunnable = null
    }

    private fun scheduleNextBindAttempt(delayMs: Long) {
        val navView = pendingNavViewRef?.get()
        if (navView == null) {
            Log.w(TAG, "Viewport bind retry stopped — NavigationView gone")
            cancelViewportBindingRetries()
            return
        }
        bindRetryRunnable =
            Runnable {
                if (viewportDataSource != null) {
                    onViewportBoundSuccess()
                    return@Runnable
                }
                attemptViewportBind(navView)
                if (viewportDataSource != null) {
                    Log.i(TAG, "ViewportDataSource bound after ${bindAttempt + 1} attempt(s)")
                    onViewportBoundSuccess()
                    return@Runnable
                }
                bindAttempt++
                if (bindAttempt >= MAX_BIND_ATTEMPTS) {
                    Log.e(
                        TAG,
                        "ViewportDataSource bind gave up after $MAX_BIND_ATTEMPTS attempts — cámara Mapbox default",
                    )
                    cancelViewportBindingRetries()
                    return@Runnable
                }
                val nextDelay =
                    when (bindAttempt) {
                        in 0..5 -> 80L * bindAttempt.coerceAtLeast(1)
                        in 6..12 -> 250L
                        in 13..20 -> 500L
                        else -> 1000L
                    }
                scheduleNextBindAttempt(nextDelay)
            }
        bindHandler.postDelayed(bindRetryRunnable!!, delayMs)
    }

    private fun onViewportBoundSuccess() {
        cancelViewportBindingRetries()
        val cb = onViewportBoundCallback
        onViewportBoundCallback = null
        cb?.invoke()
    }

    /** Prueba MapboxNavigation y NavigationView (orden alternado en reintentos). */
    private fun attemptViewportBind(navigationView: NavigationView): MapboxNavigationViewportDataSource? {
        if (viewportDataSource != null) return viewportDataSource

        val tryNavFirst = bindAttempt % 2 == 0
        if (tryNavFirst) {
            MapboxNavigationApp.current()?.let { bindFromMapboxNavigation(it) }
            if (viewportDataSource == null) {
                viewportDataSource = findViewportDataSource(navigationView)
            }
        } else {
            viewportDataSource = findViewportDataSource(navigationView)
            if (viewportDataSource == null) {
                MapboxNavigationApp.current()?.let { bindFromMapboxNavigation(it) }
            }
        }

        if (viewportDataSource != null && bindAttempt == 0) {
            Log.i(TAG, "ViewportDataSource bound — flat 2D, puck-centered, bearing north")
        }
        return viewportDataSource
    }

    private fun ensureViewport(navigationView: NavigationView): MapboxNavigationViewportDataSource? {
        if (viewportDataSource == null) {
            attemptViewportBind(navigationView)
        }
        if (viewportDataSource == null) {
            scheduleViewportBindingUntilBound(navigationView)
            Log.w(TAG, "ViewportDataSource not ready — scheduled bind retries")
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

            when (obj) {
                is Array<*> -> {
                    for (item in obj) {
                        if (item != null) enqueueGraphChild(queue, item, depth + 1)
                    }
                }
                is Collection<*> -> {
                    for (item in obj) {
                        if (item != null) enqueueGraphChild(queue, item, depth + 1)
                    }
                }
                else -> {
                    for (field in declaredFieldsIncludingSuperclasses(obj.javaClass)) {
                        try {
                            field.isAccessible = true
                            val child = field.get(obj) ?: continue
                            if (child is MapboxNavigationViewportDataSource) return child
                            enqueueGraphChild(queue, child, depth + 1)
                        } catch (_: Exception) {
                        }
                    }
                }
            }
        }
        return null
    }

    private fun enqueueGraphChild(
        queue: ArrayDeque<Pair<Any, Int>>,
        child: Any,
        depth: Int,
    ) {
        if (child is MapboxNavigationViewportDataSource) {
            queue.addFirst(child to depth)
            return
        }
        val name = child.javaClass.name
        if (
            name.startsWith("com.mapbox.") ||
            name.startsWith("android.view.") ||
            name.startsWith("androidx.") ||
            name.startsWith("com.google.android.material.")
        ) {
            queue.add(child to depth)
        }
    }

    private fun declaredFieldsIncludingSuperclasses(clazz: Class<*>): List<java.lang.reflect.Field> {
        val out = ArrayList<java.lang.reflect.Field>()
        var c: Class<*>? = clazz
        var levels = 0
        while (c != null && c != Any::class.java && levels < 6) {
            out.addAll(c.declaredFields)
            c = c.superclass
            levels++
        }
        return out
    }
}
