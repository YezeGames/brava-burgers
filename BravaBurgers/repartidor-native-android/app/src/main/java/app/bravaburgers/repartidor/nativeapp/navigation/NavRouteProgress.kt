package app.bravaburgers.repartidor.nativeapp.navigation

import app.bravaburgers.repartidor.nativeapp.data.NavStep
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Progreso sobre la polyline. Distancia a maniobra = metros **sobre la ruta**
 * hasta el punto GPS del giro (como Google Maps), no suma de step.distance OSRM.
 */
object NavRouteProgress {
    data class Snapshot(
        val stepIndex: Int,
        val distanceToManeuverM: Double,
        val alongRouteM: Double,
    )

    data class RouteProjection(
        val lat: Double,
        val lng: Double,
        val alongRouteM: Double,
        val offRouteM: Double,
    )

    /** Posición de cada maniobra proyectada sobre la geometría de la ruta. */
    fun maneuverAlongRouteM(
        steps: List<NavStep>,
        route: List<Pair<Double, Double>>,
    ): DoubleArray {
        if (steps.isEmpty()) return doubleArrayOf()
        return DoubleArray(steps.size) { i ->
            distanceAlongRouteM(steps[i].lat, steps[i].lng, route)
        }
    }

    @Deprecated("Usar maneuverAlongRouteM para distancias de giro")
    fun rebuildStepDistances(steps: List<NavStep>): DoubleArray {
        if (steps.isEmpty()) return doubleArrayOf()
        var cum = 0.0
        return DoubleArray(steps.size) { i ->
            cum += steps[i].dto.distance ?: 0.0
            cum
        }
    }

    fun distanceAlongRouteM(
        lat: Double,
        lng: Double,
        route: List<Pair<Double, Double>>,
    ): Double = projectOntoRoute(lat, lng, route)?.alongRouteM ?: 0.0

    fun projectOntoRoute(
        lat: Double,
        lng: Double,
        route: List<Pair<Double, Double>>,
    ): RouteProjection? {
        if (route.size < 2) return null
        var bestAlong = 0.0
        var bestOff = Double.POSITIVE_INFINITY
        var bestLat = lat
        var bestLng = lng
        var cum = 0.0
        for (i in 0 until route.size - 1) {
            val a = route[i]
            val b = route[i + 1]
            val segLen = haversineM(a.first, a.second, b.first, b.second)
            val (projLat, projLng, t) = projectOnSegment(lat, lng, a.first, a.second, b.first, b.second)
            val off = haversineM(lat, lng, projLat, projLng)
            val along = cum + segLen * t
            if (off < bestOff) {
                bestOff = off
                bestAlong = along
                bestLat = projLat
                bestLng = projLng
            }
            cum += segLen
        }
        return RouteProjection(bestLat, bestLng, bestAlong, bestOff)
    }

    /** Sub-polyline entre dos distancias acumuladas (para snap estilo MapLibre SnapToRoute). */
    fun routeSegmentBetween(
        route: List<Pair<Double, Double>>,
        startAlongM: Double,
        endAlongM: Double,
        maxPoints: Int = 24,
    ): List<Pair<Double, Double>> {
        if (route.size < 2 || endAlongM <= startAlongM) return emptyList()
        val start = startAlongM.coerceAtLeast(0.0)
        val end = endAlongM.coerceAtLeast(start)
        val span = (end - start).coerceAtLeast(1.0)
        val steps = maxOf(2, minOf(maxPoints, (span / 12.0).toInt() + 2))
        return (0 until steps).mapNotNull { i ->
            val t = i.toDouble() / (steps - 1).coerceAtLeast(1)
            pointAtAlongRoute(start + span * t, route)
        }
    }

    fun pointAtAlongRoute(
        alongM: Double,
        route: List<Pair<Double, Double>>,
    ): Pair<Double, Double>? {
        if (route.isEmpty()) return null
        if (route.size == 1) return route.first()
        var cum = 0.0
        for (i in 0 until route.size - 1) {
            val a = route[i]
            val b = route[i + 1]
            val segLen = haversineM(a.first, a.second, b.first, b.second)
            if (alongM <= cum + segLen || i == route.size - 2) {
                val t =
                    if (segLen <= 0.5) {
                        0.0
                    } else {
                        ((alongM - cum) / segLen).coerceIn(0.0, 1.0)
                    }
                return Pair(
                    a.first + t * (b.first - a.first),
                    a.second + t * (b.second - a.second),
                )
            }
            cum += segLen
        }
        return route.last()
    }

    fun findUpcomingStepIndex(alongM: Double, maneuverAlongM: DoubleArray): Int {
        if (maneuverAlongM.isEmpty()) return 0
        for (i in maneuverAlongM.indices) {
            if (maneuverAlongM[i] > alongM + 8.0) return i
        }
        return maneuverAlongM.size - 1
    }

    fun snapshot(
        lat: Double,
        lng: Double,
        route: List<Pair<Double, Double>>,
        steps: List<NavStep>,
        maneuverAlongM: DoubleArray,
    ): Snapshot? {
        if (steps.isEmpty() || maneuverAlongM.size != steps.size || route.size < 2) return null
        val along = distanceAlongRouteM(lat, lng, route)
        val rawIdx = findUpcomingStepIndex(along, maneuverAlongM)
        val idx = OsrmNavText.significantStepIndex(steps, rawIdx)
        val distTo = (maneuverAlongM[idx] - along).coerceAtLeast(0.0)
        return Snapshot(stepIndex = idx, distanceToManeuverM = distTo, alongRouteM = along)
    }

    /** Bearing (°) del tramo de ruta donde va el repartidor. */
    fun travelBearingDeg(
        route: List<Pair<Double, Double>>,
        alongM: Double,
    ): Double? {
        if (route.size < 2) return null
        var cum = 0.0
        for (i in 0 until route.size - 1) {
            val a = route[i]
            val b = route[i + 1]
            val segLen = haversineM(a.first, a.second, b.first, b.second)
            if (alongM <= cum + segLen || i == route.size - 2) {
                return bearingDeg(a.first, a.second, b.first, b.second)
            }
            cum += segLen
        }
        val a = route[route.size - 2]
        val b = route.last()
        return bearingDeg(a.first, a.second, b.first, b.second)
    }

    fun bearingDeg(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val phi1 = Math.toRadians(lat1)
        val phi2 = Math.toRadians(lat2)
        val dLambda = Math.toRadians(lng2 - lng1)
        val y = sin(dLambda) * cos(phi2)
        val x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dLambda)
        return (Math.toDegrees(kotlin.math.atan2(y, x)) + 360.0) % 360.0
    }

    internal fun projectOnSegment(
        lat: Double,
        lng: Double,
        lat1: Double,
        lng1: Double,
        lat2: Double,
        lng2: Double,
    ): Triple<Double, Double, Double> {
        val x = lng
        val y = lat
        val x1 = lng1
        val y1 = lat1
        val x2 = lng2
        val y2 = lat2
        val dx = x2 - x1
        val dy = y2 - y1
        var t = 0.0
        if (dx != 0.0 || dy != 0.0) {
            t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
            t = t.coerceIn(0.0, 1.0)
        }
        return Triple(y1 + t * dy, x1 + t * dx, t)
    }

    private fun haversineM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a =
            sin(dLat / 2).pow(2.0) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2.0)
        return 2 * r * asin(sqrt(a.coerceIn(0.0, 1.0)))
    }
}
