package app.bravaburgers.repartidor.nativeapp.navigation.core

import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteProgress
import kotlin.math.min

/**
 * Snap estilo [maplibre SnapToRoute](https://github.com/maplibre/maplibre-navigation-android)
 * + umbrales Ferrostar [deviation_detection](https://github.com/stadiamaps/ferrostar).
 *
 * Proyecta al **step actual** (sub-polyline), no avanza artificialmente along-route.
 */
object BravaStepLineSnap {
    data class Result(
        val lat: Double,
        val lng: Double,
        val bearing: Float?,
        val offRouteM: Double,
    )

    fun snap(
        rawLat: Double,
        rawLng: Double,
        route: List<Pair<Double, Double>>,
        maneuverAlongM: DoubleArray,
        stepIndex: Int,
        accuracyM: Float?,
        gpsBearing: Float?,
    ): Result? {
        if (route.size < 2 || maneuverAlongM.isEmpty()) return null
        val idx = stepIndex.coerceIn(0, maneuverAlongM.size - 1)
        val startAlong = if (idx == 0) 0.0 else maneuverAlongM[idx - 1]
        val endAlong = maneuverAlongM[idx]
        val stepLine = NavRouteProgress.routeSegmentBetween(route, startAlong, endAlong)
        if (stepLine.size < 2) {
            return projectFullRoute(rawLat, rawLng, route, gpsBearing)
        }

        var bestLat = rawLat
        var bestLng = rawLng
        var bestOff = Double.POSITIVE_INFINITY
        for (i in 0 until stepLine.size - 1) {
            val a = stepLine[i]
            val b = stepLine[i + 1]
            val (pLat, pLng, _) =
                NavRouteProgress.projectOnSegment(
                    rawLat,
                    rawLng,
                    a.first,
                    a.second,
                    b.first,
                    b.second,
                )
            val off = BravaGeo.haversineM(rawLat, rawLng, pLat, pLng)
            if (off < bestOff) {
                bestOff = off
                bestLat = pLat
                bestLng = pLng
            }
        }

        val maxSnap = maxSnapDistanceM(accuracyM)
        if (bestOff > maxSnap) {
            return null
        }

        val alongOnRoute = NavRouteProgress.distanceAlongRouteM(bestLat, bestLng, route)
        val routeBearing =
            NavRouteProgress.travelBearingDeg(route, alongOnRoute + 8.0)?.toFloat()
        if (!bearingCoherent(routeBearing, gpsBearing)) {
            return null
        }

        val bearing = routeBearing ?: gpsBearing
        return Result(bestLat, bestLng, bearing, bestOff)
    }

    private fun projectFullRoute(
        rawLat: Double,
        rawLng: Double,
        route: List<Pair<Double, Double>>,
        gpsBearing: Float?,
    ): Result? {
        val proj = NavRouteProgress.projectOntoRoute(rawLat, rawLng, route) ?: return null
        if (proj.offRouteM > maxSnapDistanceM(null)) return null
        val routeBearing =
            NavRouteProgress.travelBearingDeg(route, proj.alongRouteM + 8.0)?.toFloat()
        if (!bearingCoherent(routeBearing, gpsBearing)) {
            return null
        }
        val bearing = routeBearing ?: gpsBearing
        return Result(proj.lat, proj.lng, bearing, proj.offRouteM)
    }

    private fun maxSnapDistanceM(accuracyM: Float?): Double {
        val acc = accuracyM?.coerceAtLeast(0f) ?: 25f
        val adaptive = acc * NavDisplayThresholds.MAX_SNAP_OFF_ROUTE_ACCURACY_FACTOR
        return min(
            NavDisplayThresholds.MAX_SNAP_OFF_ROUTE_M,
            kotlin.math.max(NavDisplayThresholds.MAX_SNAP_OFF_ROUTE_MIN_M, adaptive),
        )
    }

    private fun bearingCoherent(routeBearing: Float?, gpsBearing: Float?): Boolean {
        if (routeBearing == null || gpsBearing == null) return true
        if (!routeBearing.isFinite() || !gpsBearing.isFinite()) return true
        val delta =
            kotlin.math.abs(
                BravaGeo.shortestRotationDiff(routeBearing.toDouble(), gpsBearing.toDouble()),
            )
        return delta <= NavDisplayThresholds.BEARING_ROUTE_GPS_MAX_DELTA_DEG
    }
}
