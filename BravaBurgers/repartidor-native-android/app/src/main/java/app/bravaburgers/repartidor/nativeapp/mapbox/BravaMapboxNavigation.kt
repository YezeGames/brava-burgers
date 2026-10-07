package app.bravaburgers.repartidor.nativeapp.mapbox

import android.content.Context
import android.os.SystemClock
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
import android.location.Location
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.dropin.NavigationView
import kotlin.math.roundToInt

/**
 * Rutas con Mapbox drop-in: [NavigationView.api.startActiveGuidance] (no [MapboxNavigation.startTripSession] manual).
 * Mezclar ambos rompe el state machine del drop-in y crashea la app.
 */
object BravaMapboxNavigation : MapboxNavigationObserver {
    private const val TAG = "BravaMapboxNav"

    @Volatile
    private var boundNavigationView: NavigationView? = null

    @Volatile
    private var mapSurfaceReady = false

    @Volatile
    var lastEnhancedLocationPoint: Point? = null
        private set

    private data class PendingRoute(val origin: Point, val dest: Point)
    private var pending: PendingRoute? = null
    private var registered = false
    private var routeRequestInFlight = false

    fun resetSession() {
        pending = null
        routeRequestInFlight = false
        mapSurfaceReady = false
        lastEnhancedLocationPoint = null
    }

    fun isMapReady(): Boolean = mapSurfaceReady

    var onRouteProgress: ((distanceRemainingM: Double?, durationRemainingSec: Double?) -> Unit)? = null

    var onManeuver: ((BravaNavManeuver?) -> Unit)? = null

    var onDrivingSpeedKmh: ((Int?) -> Unit)? = null

    var onRouteFailure: ((message: String) -> Unit)? = null

    var onActiveGuidanceStarted: (() -> Unit)? = null

    var onRoutesRefreshed: (() -> Unit)? = null

    private var lastRoutesPaddingRefreshAt = 0L

    private val routesObserver =
        RoutesObserver { update ->
            if (update.navigationRoutes.isEmpty()) return@RoutesObserver
            val view = boundNavigationView ?: return@RoutesObserver
            val now = SystemClock.uptimeMillis()
            if (now - lastRoutesPaddingRefreshAt < 2500) return@RoutesObserver
            lastRoutesPaddingRefreshAt = now
            view.post {
                onRoutesRefreshed?.invoke()
            }
        }

    private var defaultRouteProgressListener: ((Double?, Double?) -> Unit)? = null

    fun registerDefaultRouteProgressListener(listener: (Double?, Double?) -> Unit) {
        defaultRouteProgressListener = listener
        if (onRouteProgress == null) {
            onRouteProgress = listener
        }
    }

    fun restoreDefaultRouteProgressListener() {
        onRouteProgress = defaultRouteProgressListener
    }

    private val routeProgressObserver =
        RouteProgressObserver { progress ->
            onRouteProgress?.invoke(
                progress.distanceRemaining.toDouble(),
                progress.durationRemaining.toDouble(),
            )
            val banner = progress.bannerInstructions
            val stepDist =
                progress.currentLegProgress
                    ?.currentStepProgress
                    ?.distanceRemaining
                    ?.toDouble()
            val step = progress.currentLegProgress?.currentStepProgress?.step
            val stepManeuver = step?.maneuver()
            val upcomingStep = progress.currentLegProgress?.upcomingStep
            val upcomingManeuver = upcomingStep?.maneuver()
            val primaryBanner = banner?.primary()
            val subBanner = banner?.sub()
            val maneuver =
                BravaNavManeuverFormat.fromBanner(
                    primaryText = primaryBanner?.text(),
                    subText = subBanner?.text(),
                    distanceMeters = stepDist,
                    primaryManeuverType = primaryBanner?.type() ?: stepManeuver?.type(),
                    primaryModifier = primaryBanner?.modifier() ?: stepManeuver?.modifier(),
                    upcomingManeuverType = upcomingManeuver?.type(),
                    upcomingModifier = upcomingManeuver?.modifier(),
                    subManeuverType = subBanner?.type(),
                    subModifier = subBanner?.modifier(),
                )
            onManeuver?.invoke(maneuver)
            boundNavigationView?.let { view ->
                BravaMapboxCameraAnchor.maintainFlatFollowing(view)
            }
        }

    private val locationObserver =
        object : LocationObserver {
            override fun onNewRawLocation(rawLocation: Location) {
                publishSpeedKmh(rawLocation.speed)
            }

            override fun onNewLocationMatcherResult(locationMatcherResult: LocationMatcherResult) {
                publishSpeedKmh(locationMatcherResult.enhancedLocation.speed)
                lastEnhancedLocationPoint =
                    Point.fromLngLat(
                        locationMatcherResult.enhancedLocation.longitude,
                        locationMatcherResult.enhancedLocation.latitude,
                    )
            }
        }

    private fun publishSpeedKmh(speedMps: Float?) {
        val kmh =
            if (speedMps != null && speedMps >= 0f) {
                (speedMps * 3.6f).roundToInt().coerceIn(0, 199)
            } else {
                null
            }
        onDrivingSpeedKmh?.invoke(kmh)
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

    fun notifyMapSurfaceReady() {
        mapSurfaceReady = true
        flushPendingRoute()
    }

    fun notifyMapSurfaceDetached() {
        mapSurfaceReady = false
    }

    fun unbindNavigationView(view: NavigationView) {
        if (boundNavigationView === view) {
            boundNavigationView = null
            mapSurfaceReady = false
        }
    }

    override fun onAttached(mapboxNavigation: MapboxNavigation) {
        BravaMapboxCameraAnchor.bindFromMapboxNavigation(mapboxNavigation)
        mapboxNavigation.registerRouteProgressObserver(routeProgressObserver)
        mapboxNavigation.registerRoutesObserver(routesObserver)
        mapboxNavigation.registerLocationObserver(locationObserver)
        flushPendingRoute()
    }

    override fun onDetached(mapboxNavigation: MapboxNavigation) {
        mapboxNavigation.unregisterRouteProgressObserver(routeProgressObserver)
        mapboxNavigation.unregisterRoutesObserver(routesObserver)
        mapboxNavigation.unregisterLocationObserver(locationObserver)
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
        if (!mapSurfaceReady) {
            Log.i(TAG, "Map surface not ready; route queued")
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
                        onRouteFailure?.invoke("Mapbox no devolvió ruta.")
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
                        onActiveGuidanceStarted?.invoke()
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

    /** Cierra la guía sin pasar a “navegación libre” (solo sesión Mapbox en [BravaMapboxDeliveryActivity]). */
    fun stopActiveGuidance() {
        pending = null
        routeRequestInFlight = false
    }
}
