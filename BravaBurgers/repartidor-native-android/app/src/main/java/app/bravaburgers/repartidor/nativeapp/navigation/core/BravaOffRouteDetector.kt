package app.bravaburgers.repartidor.nativeapp.navigation.core

import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteGeometry

/** Off-route con histéresis; siempre evaluar con GPS crudo. */
class BravaOffRouteDetector(
    private val enterThresholdM: Double = 32.0,
    private val exitThresholdM: Double = 22.0,
    private val minSpeedKmh: Int = 4,
    private val consecutiveEnter: Int = 2,
    private val nearManeuverM: Double = 120.0,
    private val enterThresholdNearManeuverM: Double = 26.0,
    private val minRerouteIntervalMs: Long = 5500L,
) {
    data class Result(
        val offRoute: Boolean,
        val shouldReroute: Boolean,
        val distanceToRouteM: Double,
    )

    private var offRoute = false
    private var enterStreak = 0
    private var lastRerouteAtMs = 0L

    fun reset() {
        offRoute = false
        enterStreak = 0
        lastRerouteAtMs = 0L
    }

    fun evaluate(
        gpsLat: Double,
        gpsLng: Double,
        speedKmh: Int,
        route: List<Pair<Double, Double>>,
        distToNextManeuverM: Double? = null,
        nowMs: Long = System.currentTimeMillis(),
    ): Result {
        if (route.size < 2) {
            return Result(offRoute = false, shouldReroute = false, distanceToRouteM = Double.POSITIVE_INFINITY)
        }
        val distM = NavRouteGeometry.distanceToRouteM(gpsLat, gpsLng, route)
        if (speedKmh < minSpeedKmh) {
            enterStreak = 0
            return Result(offRoute = offRoute, shouldReroute = false, distanceToRouteM = distM)
        }
        var enter = enterThresholdM
        if (distToNextManeuverM != null && distToNextManeuverM <= nearManeuverM) {
            enter = minOf(enter, enterThresholdNearManeuverM)
        }
        if (!offRoute) {
            if (distM > enter) {
                enterStreak += 1
                if (enterStreak >= consecutiveEnter) offRoute = true
            } else {
                enterStreak = 0
            }
        } else if (distM < exitThresholdM) {
            offRoute = false
            enterStreak = 0
        }
        val shouldReroute = offRoute && nowMs - lastRerouteAtMs >= minRerouteIntervalMs
        return Result(offRoute = offRoute, shouldReroute = shouldReroute, distanceToRouteM = distM)
    }

    fun markRerouteRequested(nowMs: Long = System.currentTimeMillis()) {
        lastRerouteAtMs = nowMs
        enterStreak = 0
    }
}
