package app.bravaburgers.repartidor.nativeapp.navigation.core

import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteProgress
import kotlin.math.max

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

        val acc = accuracyM?.coerceAtLeast(0f) ?: 25f
        val maxSnap = max(50.0, acc * 2.0)
        if (bestOff > maxSnap) {
            return null
        }

        val alongOnRoute = NavRouteProgress.distanceAlongRouteM(bestLat, bestLng, route)
        val bearing =
            NavRouteProgress.travelBearingDeg(route, alongOnRoute + 8.0)?.toFloat()
                ?: gpsBearing
        return Result(bestLat, bestLng, bearing, bestOff)
    }

    private fun projectFullRoute(
        rawLat: Double,
        rawLng: Double,
        route: List<Pair<Double, Double>>,
        gpsBearing: Float?,
    ): Result? {
        val proj = NavRouteProgress.projectOntoRoute(rawLat, rawLng, route) ?: return null
        val accGate = 50.0
        if (proj.offRouteM > accGate) return null
        val bearing =
            NavRouteProgress.travelBearingDeg(route, proj.alongRouteM + 8.0)?.toFloat()
                ?: gpsBearing
        return Result(proj.lat, proj.lng, bearing, proj.offRouteM)
    }
}
