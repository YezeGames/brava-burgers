package app.bravaburgers.repartidor.nativeapp.navigation.core

import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteProgress
import kotlin.math.abs

/**
 * Adaptado de Mapbox Navigation SDK (Apache 2.0)
 * — ViewportDataSourceProcessor.getSmootherBearingForMap
 */
object BravaBearingSmoother {
    fun getSmootherBearingForMap(
        enabled: Boolean,
        maxBearingAngleDiff: Double,
        currentMapCameraBearing: Double,
        vehicleBearing: Double,
        pointsForBearing: List<Pair<Double, Double>>,
    ): Double {
        if (!enabled) return vehicleBearing
        var output = vehicleBearing
        if (pointsForBearing.size > 1) {
            val first = pointsForBearing.first()
            val last = pointsForBearing.last()
            val bearingFromPoints =
                NavRouteProgress.bearingDeg(first.first, first.second, last.first, last.second)
            val bearingDiff = BravaGeo.shortestRotationDiff(bearingFromPoints, vehicleBearing)
            output =
                if (abs(bearingDiff) > maxBearingAngleDiff) {
                    val dir = if (bearingDiff < 0) -1.0 else 1.0
                    vehicleBearing + maxBearingAngleDiff * dir
                } else {
                    bearingFromPoints
                }
        }
        return BravaGeo.wrapDeg(
            currentMapCameraBearing + BravaGeo.shortestRotationDiff(output, currentMapCameraBearing),
        )
    }
}

class BravaBearingSmootherState(
    private val maxBearingAngleDiff: Double = 45.0,
    private val lowSpeedEmaAlpha: Double = 0.15,
    private val lowSpeedKmh: Int = 5,
) {
    private var cameraBearing: Double? = null
    private var emaBearing: Double? = null

    fun reset(initial: Double? = null) {
        cameraBearing = initial
        emaBearing = initial
    }

    fun update(
        vehicleBearing: Double?,
        speedKmh: Int,
        framingPoints: List<Pair<Double, Double>>,
    ): Double? {
        if (vehicleBearing == null || !vehicleBearing.isFinite()) return cameraBearing
        var vBearing = vehicleBearing
        if (speedKmh < lowSpeedKmh) {
            val prev = emaBearing ?: vehicleBearing
            val d = BravaGeo.shortestRotationDiff(vehicleBearing, prev)
            emaBearing = BravaGeo.wrapDeg(prev + d * lowSpeedEmaAlpha)
            vBearing = emaBearing!!
        } else {
            emaBearing = vehicleBearing
        }
        val current = cameraBearing ?: vBearing
        val next =
            BravaBearingSmoother.getSmootherBearingForMap(
                enabled = true,
                maxBearingAngleDiff = maxBearingAngleDiff,
                currentMapCameraBearing = current,
                vehicleBearing = vBearing,
                pointsForBearing = framingPoints,
            )
        cameraBearing = next
        return next
    }
}
