package app.bravaburgers.repartidor.nativeapp.navigation.core



import app.bravaburgers.repartidor.nativeapp.navigation.NavDriverDisplaySmoother
import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteProgress



/**

 * Equivalente Brava de: LocationObserver → LocationMatcherResult → NavigationLocationProvider.

 * GPS crudo solo para lógica; el puck consume [BravaLocationMatcherResult.enhancedLocation].

 */

class BravaNavDisplayPipeline {

    private val animator = BravaLocationAnimator()

    private val bearing = BravaBearingSmootherState()

    val offRoute = BravaOffRouteDetector()

    private val stationary = BravaStationaryGpsController()

    private val mapMatcher = BravaOpenMapMatcher(stationary, NavDriverDisplaySmoother())



    private var courseBearing: Float? = null

    private var lastRoute: List<Pair<Double, Double>> = emptyList()



    val isStationaryLocked: Boolean

        get() = stationary.isLocked



    fun reset() {

        animator.reset()

        bearing.reset(courseBearing?.toDouble())

        offRoute.reset()

        mapMatcher.reset()

        courseBearing = null

        lastRoute = emptyList()

        stationary.reset()

    }



    fun onRouteLoaded(
        route: List<Pair<Double, Double>>,
        transitionFromDisplay: Pair<Double, Double>? = null,
    ) {
        lastRoute = route
        mapMatcher.onRouteLoaded(route)
        courseBearing = NavRouteProgress.travelBearingDeg(route, 0.0)?.toFloat()
        bearing.reset(courseBearing?.toDouble())

        val from = transitionFromDisplay ?: animator.displayPosition()
        if (from != null && route.size >= 2) {
            val proj = NavRouteProgress.projectOntoRoute(from.first, from.second, route)
            if (proj != null && proj.offRouteM <= NavDisplayThresholds.REROUTE_SOFT_SNAP_MAX_M) {
                val brg =
                    NavRouteProgress.travelBearingDeg(route, proj.alongRouteM + 8.0)?.toFloat()
                        ?: courseBearing
                animator.pushGpsFix(
                    proj.lat,
                    proj.lng,
                    brg,
                    speedMps = null,
                )
            }
        }
    }



    /** Nuevo fix GPS crudo (~1 Hz) → matcher → animador (Mapbox-style). */

    fun onGpsFix(

        rawLat: Double,

        rawLng: Double,

        speedMps: Float?,

        gpsBearing: Float?,

        accuracyM: Float? = null,

        matchContext: NavMatchContext? = null,

    ) {

        val matched =

            mapMatcher.match(rawLat, rawLng, speedMps, accuracyM, gpsBearing, matchContext) ?: return

        if (matched.isDegradedMatching) {

            animator.snapTo(matched.enhancedLat, matched.enhancedLng, matched.bearing)

            return

        }

        animator.pushEnhancedFix(
            matched.enhancedLat,
            matched.enhancedLng,
            matched.bearing,
            isTeleport = matched.isTeleport,
            speedMps = speedMps,
        )
    }

    /** Valhalla `/locate` async — solo puck; voz/reruta siguen con GPS crudo. */
    fun applyValhallaLocate(
        locateLat: Double,
        locateLng: Double,
        rawLat: Double,
        rawLng: Double,
        speedMps: Float?,
        gpsBearing: Float?,
    ) {
        if (stationary.isLocked) return
        val matched =
            mapMatcher.enhanceFromValhallaLocate(
                locateLat,
                locateLng,
                rawLat,
                rawLng,
                speedMps,
                gpsBearing,
            ) ?: return
        animator.pushEnhancedFix(
            matched.enhancedLat,
            matched.enhancedLng,
            matched.bearing,
            isTeleport = matched.isTeleport,
            speedMps = speedMps,
        )
    }

    fun tickDisplay(speedKmh: Int, vehicleBearing: Float?): BravaLocationAnimator.DisplaySample? {

        val sample = animator.tick() ?: return null

        if (speedKmh < 5) {

            val frozen = courseBearing ?: sample.bearing

            return sample.copy(bearing = frozen)

        }

        val framing =

            if (lastRoute.size >= 2) {

                val along = NavRouteProgress.distanceAlongRouteM(sample.lat, sample.lng, lastRoute)

                listOfNotNull(

                    NavRouteProgress.pointAtAlongRoute(along + 40.0, lastRoute),

                    NavRouteProgress.pointAtAlongRoute(along + 120.0, lastRoute),

                )

            } else {

                emptyList()

            }

        val brg =

            bearing.update(

                vehicleBearing = vehicleBearing?.toDouble() ?: sample.bearing?.toDouble(),

                speedKmh = speedKmh,

                framingPoints = framing,

            )

        return sample.copy(bearing = brg?.toFloat() ?: sample.bearing)

    }

}


