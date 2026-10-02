package app.bravaburgers.repartidor.nativeapp.navigation.core

import app.bravaburgers.repartidor.nativeapp.navigation.NavDriverDisplaySmoother
import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteProgress

/**
 * GPS crudo → lógica; [tickDisplay] → MapLibre (~60 FPS).
 * Snap a ruta solo en movimiento (NavDriverDisplaySmoother).
 */
class BravaNavDisplayPipeline {
    private val animator = BravaLocationAnimator()
    private val bearing = BravaBearingSmootherState()
    val offRoute = BravaOffRouteDetector()
    private val routeSnap = NavDriverDisplaySmoother()

    private var courseBearing: Float? = null
    private var lastRoute: List<Pair<Double, Double>> = emptyList()

    fun reset() {
        animator.reset()
        bearing.reset(courseBearing?.toDouble())
        offRoute.reset()
        routeSnap.reset()
        courseBearing = null
        lastRoute = emptyList()
    }

    fun onRouteLoaded(route: List<Pair<Double, Double>>) {
        lastRoute = route
        routeSnap.reset()
        courseBearing = NavRouteProgress.travelBearingDeg(route, 0.0)?.toFloat()
        bearing.reset(courseBearing?.toDouble())
    }

    /** Destino visual del animador (posible snap en movimiento). */
    fun onGpsFix(
        rawLat: Double,
        rawLng: Double,
        speedMps: Float?,
        gpsBearing: Float?,
    ) {
        val speedMpsSafe = speedMps?.coerceAtLeast(0f) ?: 0f
        val moving = speedMpsSafe >= NavDriverDisplaySmoother.MOVING_MIN_SPEED_MPS
        val (targetLat, targetLng) =
            if (moving && lastRoute.size >= 2) {
                routeSnap.mapPosition(rawLat, rawLng, speedMps, lastRoute)
            } else {
                Pair(rawLat, rawLng)
            }
        val displayBearing =
            when {
                !moving -> courseBearing ?: gpsBearing
                lastRoute.size >= 2 ->
                    routeSnap.displayBearing(lastRoute) ?: gpsBearing ?: courseBearing
                else -> gpsBearing ?: courseBearing
            }
        animator.pushGpsFix(targetLat, targetLng, displayBearing)
    }

    fun tickDisplay(speedKmh: Int, vehicleBearing: Float?): BravaLocationAnimator.DisplaySample? {
        val sample = animator.tick() ?: return null
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
