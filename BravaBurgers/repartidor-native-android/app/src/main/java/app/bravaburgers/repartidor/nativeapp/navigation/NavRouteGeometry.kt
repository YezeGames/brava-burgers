package app.bravaburgers.repartidor.nativeapp.navigation

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Distancia repartidor ↔ polyline OSRM (como repartidor/index.html). */
object NavRouteGeometry {
    fun distanceToRouteM(
        lat: Double,
        lng: Double,
        route: List<Pair<Double, Double>>,
    ): Double {
        if (route.size < 2) return Double.POSITIVE_INFINITY
        var minD = Double.POSITIVE_INFINITY
        for (i in 0 until route.size - 1) {
            val a = route[i]
            val b = route[i + 1]
            val d = pointToSegmentDistanceM(lat, lng, a.first, a.second, b.first, b.second)
            if (d < minD) minD = d
        }
        return minD
    }

    private fun pointToSegmentDistanceM(
        lat: Double,
        lng: Double,
        lat1: Double,
        lng1: Double,
        lat2: Double,
        lng2: Double,
    ): Double {
        val dx = lng2 - lng1
        val dy = lat2 - lat1
        if (dx == 0.0 && dy == 0.0) {
            return haversineM(lat, lng, lat1, lng1)
        }
        var t =
            ((lng - lng1) * dx + (lat - lat1) * dy) / (dx * dx + dy * dy)
        t = t.coerceIn(0.0, 1.0)
        val projLat = lat1 + t * dy
        val projLng = lng1 + t * dx
        return haversineM(lat, lng, projLat, projLng)
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
