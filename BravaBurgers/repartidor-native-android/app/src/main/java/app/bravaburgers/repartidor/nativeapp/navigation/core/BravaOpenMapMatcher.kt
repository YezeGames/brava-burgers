package app.bravaburgers.repartidor.nativeapp.navigation.core

import app.bravaburgers.repartidor.nativeapp.navigation.NavDriverDisplaySmoother
import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteProgress

/**
 * Sustituto OSS del map matcher de Mapbox: produce [BravaLocationMatcherResult] para el animador.
 * GPS crudo no debe ir directo al puck (ver NavigationLocationProvider en mapbox-navigation-android).
 */
class BravaOpenMapMatcher(
    private val stationary: BravaStationaryGpsController,
    private val routeSnap: NavDriverDisplaySmoother,
) {
    private var lastEnhancedLat: Double? = null
    private var lastEnhancedLng: Double? = null
    private var lastRoute: List<Pair<Double, Double>> = emptyList()
    private var courseBearing: Float? = null

    fun onRouteLoaded(route: List<Pair<Double, Double>>) {
        lastRoute = route
        routeSnap.reset()
        courseBearing = NavRouteProgress.travelBearingDeg(route, 0.0)?.toFloat()
        lastEnhancedLat = null
        lastEnhancedLng = null
    }

    fun reset() {
        lastRoute = emptyList()
        courseBearing = null
        lastEnhancedLat = null
        lastEnhancedLng = null
        routeSnap.reset()
    }

    fun match(
        rawLat: Double,
        rawLng: Double,
        speedMps: Float?,
        accuracyM: Float?,
        gpsBearing: Float?,
        matchContext: NavMatchContext? = null,
    ): BravaLocationMatcherResult? {
        val filtered =
            stationary.onFix(
                rawLat = rawLat,
                rawLng = rawLng,
                speedMps = speedMps,
                accuracyM = accuracyM,
            )

        if (filtered.locked) {
            routeSnap.reset()
            val a = filtered.anchor ?: return null
            val brg = courseBearing ?: gpsBearing
            return result(a.first, a.second, brg, isDegraded = true)
        }

        val displayRaw = filtered.displayLatLng ?: return null
        val speedMpsSafe = speedMps?.coerceAtLeast(0f) ?: 0f
        val moving = speedMpsSafe >= NavDriverDisplaySmoother.MOVING_MIN_SPEED_MPS
        if (!moving) {
            val brg = courseBearing ?: gpsBearing
            return result(displayRaw.first, displayRaw.second, brg, isDegraded = false)
        }

        val ctx = matchContext
        val stepSnap =
            if (ctx != null && lastRoute.size >= 2) {
                BravaStepLineSnap.snap(
                    displayRaw.first,
                    displayRaw.second,
                    lastRoute,
                    ctx.maneuverAlongM,
                    ctx.stepIndex,
                    accuracyM,
                    gpsBearing,
                )
            } else {
                null
            }
        val (lat, lng, bearing) =
            if (stepSnap != null) {
                Triple(stepSnap.lat, stepSnap.lng, stepSnap.bearing)
            } else {
                Triple(displayRaw.first, displayRaw.second, gpsBearing ?: courseBearing)
            }
        return result(lat, lng, bearing, isDegraded = false)
    }

    /**
     * Valhalla `/locate` (async): refina enhanced sin tocar voz/reruta.
     * Si el snap cae en otra cuadra, se prefiere la proyección sobre la ruta OSRM.
     */
    fun enhanceFromValhallaLocate(
        locateLat: Double,
        locateLng: Double,
        rawLat: Double,
        rawLng: Double,
        speedMps: Float?,
        gpsBearing: Float?,
    ): BravaLocationMatcherResult? {
        if (stationary.isLocked) return null
        if (BravaGeo.haversineM(rawLat, rawLng, locateLat, locateLng) > MAX_VALHALLA_FROM_RAW_M) {
            return null
        }

        var lat = locateLat
        var lng = locateLng
        if (lastRoute.size >= 2) {
            val proj = NavRouteProgress.projectOntoRoute(rawLat, rawLng, lastRoute)
            if (proj != null && proj.offRouteM < ON_ROUTE_MAX_OFF_M) {
                val routePt = Pair(proj.lat, proj.lng)
                val locateOffRouteM =
                    BravaGeo.haversineM(locateLat, locateLng, routePt.first, routePt.second)
                if (locateOffRouteM > PARALLEL_STREET_REJECT_M) {
                    lat = routePt.first
                    lng = routePt.second
                }
            }
        }

        val speedMpsSafe = speedMps?.coerceAtLeast(0f) ?: 0f
        val moving = speedMpsSafe >= NavDriverDisplaySmoother.MOVING_MIN_SPEED_MPS
        val bearing =
            when {
                !moving -> courseBearing ?: gpsBearing
                lastRoute.size >= 2 ->
                    routeSnap.displayBearing(lastRoute) ?: gpsBearing ?: courseBearing
                else -> gpsBearing ?: courseBearing
            }
        return result(lat, lng, bearing, isDegraded = false)
    }

    private fun result(
        lat: Double,
        lng: Double,
        bearing: Float?,
        isDegraded: Boolean,
    ): BravaLocationMatcherResult {
        val prevLat = lastEnhancedLat
        val prevLng = lastEnhancedLng
        val teleport =
            if (prevLat != null && prevLng != null) {
                BravaGeo.haversineM(prevLat, prevLng, lat, lng) >= TELEPORT_M
            } else {
                false
            }
        lastEnhancedLat = lat
        lastEnhancedLng = lng
        return BravaLocationMatcherResult(
            enhancedLat = lat,
            enhancedLng = lng,
            bearing = bearing,
            isTeleport = teleport,
            isDegradedMatching = isDegraded,
        )
    }

    companion object {
        /** Mismo criterio que Mapbox: no animar saltos absurdos (p. ej. GPS a la calle en 1 fix). */
        private val TELEPORT_M = NavDisplayThresholds.TELEPORT_JUMP_M
        private const val MAX_VALHALLA_FROM_RAW_M = 42.0
        private const val ON_ROUTE_MAX_OFF_M = 55.0
        private const val PARALLEL_STREET_REJECT_M = 26.0
    }
}
