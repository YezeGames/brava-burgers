package app.bravaburgers.repartidor.nativeapp.mapbox

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.geojson.Point
import com.mapbox.maps.MapView
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.extensions.applyLanguageAndVoiceUnitOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.base.route.RouterOrigin
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.lifecycle.MapboxNavigationObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver
import kotlin.math.roundToInt

/**
 * Navegación activa con [MapView] nativo: rutas + [MapboxNavigation.startTripSession].
 */
object BravaMapboxNavigation : MapboxNavigationObserver {
    private const val TAG = "BravaMapboxNav"

    @Volatile
    private var boundMapView: MapView? = null

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

    fun isMapReady(): Boolean = mapSurfaceReady && BravaMapboxMapSession.isMapReady()

    var onRouteProgress: ((distanceRemainingM: Double?, durationRemainingSec: Double?) -> Unit)? = null

    var onManeuver: ((BravaNavManeuver?) -> Unit)? = null

    var onDrivingSpeedKmh: ((Int?) -> Unit)? = null

    var onRouteFailure: ((message: String) -> Unit)? = null

    var onActiveGuidanceStarted: (() -> Unit)? = null

    var onRoutesRefreshed: (() -> Unit)? = null

    private var lastRoutesPaddingRefreshAt = 0L

    private val routesObserver =
        RoutesObserver { update ->
            val routes = update.navigationRoutes
            if (routes.isNotEmpty()) {
                BravaMapboxMapSession.drawRoutes(routes)
                BravaMapboxCameraAnchor.onRoutesChanged(true, routes.first())
            } else {
                BravaMapboxMapSession.clearRoutes()
                BravaMapboxCameraAnchor.onRoutesChanged(false, null)
            }
            val view = boundMapView ?: return@RoutesObserver
            val now = SystemClock.uptimeMillis()
            if (now - lastRoutesPaddingRefreshAt < 2500) return@RoutesObserver
            lastRoutesPaddingRefreshAt = now
            view.post { onRoutesRefreshed?.invoke() }
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
            BravaMapboxMapSession.updateRouteProgress(progress)
            BravaMapboxCameraAnchor.onRouteProgressChanged(progress)

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
            BravaMapboxCameraAnchor.maintainFlatFollowing()
        }

    private val locationObserver =
        object : LocationObserver {
            override fun onNewRawLocation(rawLocation: android.location.Location) {
                // No actualizar puck ni velocidad con GPS crudo (evita drift y punto gris duplicado).
            }

            override fun onNewLocationMatcherResult(locationMatcherResult: LocationMatcherResult) {
                val enhanced = locationMatcherResult.enhancedLocation
                publishSpeedKmh(enhanced.speed, enhanced.accuracy)
                lastEnhancedLocationPoint =
                    Point.fromLngLat(enhanced.longitude, enhanced.latitude)
                BravaMapboxMapSession.updateEnhancedLocation(enhanced)
                BravaMapboxCameraAnchor.onEnhancedLocation(enhanced)
            }
        }

    private val voiceInstructionsObserver =
        VoiceInstructionsObserver { voiceInstructions ->
            val speechApi = BravaMapboxMapSession.speechApiOrNull() ?: return@VoiceInstructionsObserver
            val player = BravaMapboxMapSession.voicePlayerOrNull() ?: return@VoiceInstructionsObserver
            speechApi.generate(voiceInstructions) { expected ->
                val value = expected.value ?: return@generate
                player.play(value.announcement) { _ -> }
            }
        }

    /** Umbral anti-ruido GPS: quieto → 0 km/h (no picos fantasma). */
    private fun publishSpeedKmh(
        speedMps: Float?,
        accuracyMeters: Float,
    ) {
        if (!accuracyMeters.isFinite() || accuracyMeters <= 0f || accuracyMeters > 25f) {
            onDrivingSpeedKmh?.invoke(0)
            return
        }
        if (speedMps == null || speedMps < 0f || speedMps < 0.6f) {
            onDrivingSpeedKmh?.invoke(0)
            return
        }
        val kmh = (speedMps * 3.6f).roundToInt().coerceIn(0, 199)
        onDrivingSpeedKmh?.invoke(if (kmh < 2) 0 else kmh)
    }

    fun ensureRegistered() {
        if (registered) return
        MapboxNavigationApp.registerObserver(this)
        registered = true
    }

    fun bindMapView(view: MapView) {
        boundMapView = view
        flushPendingRoute()
    }

    fun notifyMapSurfaceReady() {
        mapSurfaceReady = true
        flushPendingRoute()
    }

    fun notifyMapSurfaceDetached() {
        mapSurfaceReady = false
    }

    fun unbindMapView(view: MapView) {
        if (boundMapView === view) {
            boundMapView = null
            mapSurfaceReady = false
        }
    }

    override fun onAttached(mapboxNavigation: MapboxNavigation) {
        mapboxNavigation.registerRouteProgressObserver(routeProgressObserver)
        mapboxNavigation.registerRoutesObserver(routesObserver)
        mapboxNavigation.registerLocationObserver(locationObserver)
        mapboxNavigation.registerVoiceInstructionsObserver(voiceInstructionsObserver)
        flushPendingRoute()
    }

    override fun onDetached(mapboxNavigation: MapboxNavigation) {
        mapboxNavigation.unregisterRouteProgressObserver(routeProgressObserver)
        mapboxNavigation.unregisterRoutesObserver(routesObserver)
        mapboxNavigation.unregisterLocationObserver(locationObserver)
        mapboxNavigation.unregisterVoiceInstructionsObserver(voiceInstructionsObserver)
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
        if (boundMapView == null) {
            Log.i(TAG, "MapView not bound yet; route queued")
            return
        }
        if (!isMapReady()) {
            Log.i(TAG, "Map/style not ready; route queued")
            return
        }
        val nav = MapboxNavigationApp.current() ?: run {
            Log.i(TAG, "MapboxNavigation not ready; route queued")
            return
        }
        val appContext = context ?: boundMapView?.context?.applicationContext ?: return
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
                    if (boundMapView == null) {
                        pending = trip
                        return
                    }
                    pending = null
                    try {
                        nav.setNavigationRoutes(routes)
                        nav.startTripSession()
                        BravaMapboxMapSession.drawRoutes(routes)
                        BravaMapboxCameraAnchor.onRoutesChanged(true, routes.first())
                        Log.i(TAG, "Active guidance via MapboxNavigation + MapView")
                        onActiveGuidanceStarted?.invoke()
                    } catch (e: Exception) {
                        Log.e(TAG, "startTripSession failed", e)
                        pending = trip
                        onRouteFailure?.invoke(e.message ?: "No se pudo iniciar la guía.")
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
        MapboxNavigationApp.current()?.let { nav ->
            try {
                nav.setNavigationRoutes(emptyList())
                nav.stopTripSession()
            } catch (_: Exception) {
            }
        }
        BravaMapboxMapSession.clearRoutes()
        BravaMapboxCameraAnchor.onRoutesChanged(false, null)
    }
}
