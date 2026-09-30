package app.bravaburgers.repartidor.nativeapp.navigation

import app.bravaburgers.repartidor.nativeapp.data.NavStep
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Progreso sobre la polyline (map-matching simple), igual que repartidor/index.html.
 * La distancia a la próxima maniobra sale **a lo largo de la ruta**, no en línea recta al punto OSRM.
 */
object NavRouteProgress {
    data class Snapshot(
        val stepIndex: Int,
        val distanceToManeuverM: Double,
        val alongRouteM: Double,
    )

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
    ): Double {
        if (route.size < 2) return 0.0
        var bestAlong = 0.0
        var bestOff = Double.POSITIVE_INFINITY
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
            }
            cum += segLen
        }
        return bestAlong
    }

    fun findStepIndex(alongM: Double, stepEndDistM: DoubleArray): Int {
        if (stepEndDistM.isEmpty()) return 0
        for (i in stepEndDistM.indices) {
            if (stepEndDistM[i] > alongM + 10.0) return i
        }
        return stepEndDistM.size - 1
    }

    fun snapshot(
        lat: Double,
        lng: Double,
        route: List<Pair<Double, Double>>,
        steps: List<NavStep>,
        stepEndDistM: DoubleArray,
    ): Snapshot? {
        if (steps.isEmpty() || stepEndDistM.size != steps.size) return null
        val along = distanceAlongRouteM(lat, lng, route)
        val idx = findStepIndex(along, stepEndDistM)
        val distTo = (stepEndDistM[idx] - along).coerceAtLeast(0.0)
        return Snapshot(stepIndex = idx, distanceToManeuverM = distTo, alongRouteM = along)
    }

    private fun projectOnSegment(
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
