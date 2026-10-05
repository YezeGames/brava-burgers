package app.bravaburgers.repartidor.nativeapp.mapbox

import android.content.Context
import android.util.Log
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.geojson.Point
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.extensions.applyLanguageAndVoiceUnitOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.base.route.RouterOrigin
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.lifecycle.MapboxNavigationObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.dropin.NavigationView

/**
 * Rutas con Mapbox drop-in: [NavigationView.api.startActiveGuidance] (no [MapboxNavigation.startTripSession] manual).
 * Mezclar ambos rompe el state machine del drop-in y crashea la app.
 */
object BravaMapboxNavigation : MapboxNavigationObserver {
    private const val TAG = "BravaMapboxNav"

    @Volatile
    private var boundNavigationView: NavigationView? = null

    private data class PendingRoute(val origin: Point, val dest: Point)
    private var pending: PendingRoute? = null
    private var registered = false
    private var routeRequestInFlight = false

    var onRouteProgress: ((distanceRemainingM: Double?, durationRemainingSec: Double?) -> Unit)? = null

    var onRouteFailure: ((message: String) -> Unit)? = null

    private val routeProgressObserver =
        RouteProgressObserver { progress ->
            onRouteProgress?.invoke(
                progress.distanceRemaining.toDouble(),
                progress.durationRemaining.toDouble(),
            )
        }

    fun ensureRegistered() {
        if (registered) return
        MapboxNavigationApp.registerObserver(this)
        registered = true
    }

    fun bindNavigationView(view: NavigationView) {
        boundNavigationView = view
        flushPendingRoute()
    }

    fun unbindNavigationView(view: NavigationView) {
        if (boundNavigationView === view) {
            boundNavigationView = null
        }
    }

    override fun onAttached(mapboxNavigation: MapboxNavigation) {
        mapboxNavigation.registerRouteProgressObserver(routeProgressObserver)
        flushPendingRoute()
    }

    override fun onDetached(mapboxNavigation: MapboxNavigation) {
        mapboxNavigation.unregisterRouteProgressObserver(routeProgressObserver)
    }

    fun requestActiveGuidance(
        context: Context,
        originLat: Double,
        originLng: Double,
        destLat: Double,
        destLng: Double,
    ) {
        val origin = Point.fromLngLat(originLng, originLat)
        val dest = Point.fromLngLat(destLng, destLat)
        pending = PendingRoute(origin, dest)
        flushPendingRoute(context.applicationContext)
    }

    private fun flushPendingRoute(context: Context? = null) {
        val trip = pending ?: return
        if (routeRequestInFlight) return
        if (boundNavigationView == null) {
            Log.i(TAG, "NavigationView not bound yet; route queued")
            return
        }
        val nav = MapboxNavigationApp.current() ?: run {
            Log.i(TAG, "MapboxNavigation not ready; route queued")
            return
        }
        val appContext = context ?: boundNavigationView?.context?.applicationContext ?: return
        routeRequestInFlight = true
        nav.requestRoutes(
            RouteOptions
                .builder()
                .applyDefaultNavigationOptions()
                .applyLanguageAndVoiceUnitOptions(appContext)
                .coordinatesList(listOf(trip.origin, trip.dest))
                .alternatives(false)
                .build(),
            object : NavigationRouterCallback {
                override fun onRoutesReady(
                    routes: List<NavigationRoute>,
                    routerOrigin: RouterOrigin,
                ) {
                    routeRequestInFlight = false
                    if (routes.isEmpty()) {
                        Log.e(TAG, "Empty routes")
                        return
                    }
                    val view = boundNavigationView
                    if (view == null) {
                        pending = trip
                        return
                    }
                    pending = null
                    val result = view.api.startActiveGuidance(routes)
                    result.onError { err ->
                        Log.e(TAG, "startActiveGuidance failed: $err")
                        pending = trip
                        onRouteFailure?.invoke(err.toString())
                    }
                    result.onValue {
                        Log.i(TAG, "Active guidance via NavigationView.api")
                    }
                }

                override fun onFailure(
                    reasons: List<RouterFailure>,
                    routeOptions: RouteOptions,
                ) {
                    routeRequestInFlight = false
                    Log.e(TAG, "Route failure: $reasons")
                    onRouteFailure?.invoke(
                        reasons.firstOrNull()?.message ?: "No pudimos calcular la ruta (Mapbox).",
                    )
                }

                override fun onCanceled(
                    routeOptions: RouteOptions,
                    routerOrigin: RouterOrigin,
                ) {
                    routeRequestInFlight = false
                    Log.w(TAG, "Route canceled")
                }
            },
        )
    }

    fun stopActiveGuidance() {
        pending = null
        routeRequestInFlight = false
        boundNavigationView?.api?.startFreeDrive()
    }
}
