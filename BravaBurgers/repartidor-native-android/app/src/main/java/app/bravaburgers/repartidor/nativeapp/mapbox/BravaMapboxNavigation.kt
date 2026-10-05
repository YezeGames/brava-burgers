package app.bravaburgers.repartidor.nativeapp.mapbox

import android.util.Log
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.geojson.Point
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.base.route.RouterOrigin
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.lifecycle.MapboxNavigationObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver

/** Rutas y active guidance vía Mapbox Navigation SDK (α57). */
object BravaMapboxNavigation : MapboxNavigationObserver {
    private const val TAG = "BravaMapboxNav"

    private var mapboxNavigation: MapboxNavigation? = null
    private data class PendingRoute(val origin: Point, val dest: Point)
    private var pending: PendingRoute? = null
    private var registered = false

    var onRouteProgress: ((distanceRemainingM: Double?, durationRemainingSec: Double?) -> Unit)? = null

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

    fun unregisterIfNeeded() {
        if (!registered) return
        MapboxNavigationApp.unregisterObserver(this)
        registered = false
        mapboxNavigation = null
        pending = null
    }

    override fun onAttached(mapboxNavigation: MapboxNavigation) {
        this.mapboxNavigation = mapboxNavigation
        mapboxNavigation.registerRouteProgressObserver(routeProgressObserver)
        pending?.let { (o, d) -> requestRoutesInternal(mapboxNavigation, o, d) }
    }

    override fun onDetached(mapboxNavigation: MapboxNavigation) {
        mapboxNavigation.unregisterRouteProgressObserver(routeProgressObserver)
        if (this.mapboxNavigation == mapboxNavigation) {
            this.mapboxNavigation = null
        }
    }

    fun requestActiveGuidance(
        originLat: Double,
        originLng: Double,
        destLat: Double,
        destLng: Double,
    ) {
        val origin = Point.fromLngLat(originLng, originLat)
        val dest = Point.fromLngLat(destLng, destLat)
        pending = PendingRoute(origin, dest)
        mapboxNavigation?.let { requestRoutesInternal(it, origin, dest) }
            ?: Log.i(TAG, "Navigation not attached; route queued")
    }

    private fun requestRoutesInternal(
        nav: MapboxNavigation,
        origin: Point,
        dest: Point,
    ) {
        nav.requestRoutes(
            RouteOptions
                .builder()
                .applyDefaultNavigationOptions()
                .coordinatesList(listOf(origin, dest))
                .build(),
            object : NavigationRouterCallback {
                override fun onRoutesReady(
                    routes: List<NavigationRoute>,
                    routerOrigin: RouterOrigin,
                ) {
                    if (routes.isEmpty()) {
                        Log.e(TAG, "Empty routes")
                        return
                    }
                    nav.setNavigationRoutes(routes)
                    nav.startTripSession()
                    Log.i(TAG, "Active guidance · ${routes.size} route(s)")
                }

                override fun onFailure(
                    reasons: List<RouterFailure>,
                    routeOptions: RouteOptions,
                ) {
                    Log.e(TAG, "Route failure: $reasons")
                }

                override fun onCanceled(
                    routeOptions: RouteOptions,
                    routerOrigin: RouterOrigin,
                ) {
                    Log.w(TAG, "Route canceled")
                }
            },
        )
    }

    fun stopActiveGuidance() {
        pending = null
        mapboxNavigation?.let { nav ->
            nav.stopTripSession()
            nav.setNavigationRoutes(emptyList())
        }
    }
}
