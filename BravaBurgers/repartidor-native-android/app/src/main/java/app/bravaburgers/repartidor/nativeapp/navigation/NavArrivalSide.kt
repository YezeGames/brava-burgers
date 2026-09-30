package app.bravaburgers.repartidor.nativeapp.navigation

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/** Lado del destino respecto al sentido de marcha (heurística tipo navegador). */
object NavArrivalSide {
    enum class Side {
        LEFT,
        RIGHT,
    }

    fun sideOfDestination(
        driverLat: Double,
        driverLng: Double,
        destLat: Double,
        destLng: Double,
        route: List<Pair<Double, Double>>,
        alongRouteM: Double,
    ): Side? {
        val travel = travelBearingDeg(route, alongRouteM) ?: return null
        val toDest = bearingDeg(driverLat, driverLng, destLat, destLng)
        var delta = toDest - travel
        while (delta > 180.0) delta -= 360.0
        while (delta < -180.0) delta += 360.0
        return when {
            delta in 28.0..152.0 -> Side.RIGHT
            delta in -152.0..-28.0 -> Side.LEFT
            else -> null
        }
    }

    private fun travelBearingDeg(route: List<Pair<Double, Double>>, alongM: Double): Double? {
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

    private fun bearingDeg(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val phi1 = Math.toRadians(lat1)
        val phi2 = Math.toRadians(lat2)
        val dLambda = Math.toRadians(lng2 - lng1)
        val y = sin(dLambda) * cos(phi2)
        val x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dLambda)
        return (Math.toDegrees(atan2(y, x)) + 360.0) % 360.0
    }

    private fun haversineM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a =
            sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * r * kotlin.math.asin(kotlin.math.sqrt(a.coerceIn(0.0, 1.0)))
    }
}
