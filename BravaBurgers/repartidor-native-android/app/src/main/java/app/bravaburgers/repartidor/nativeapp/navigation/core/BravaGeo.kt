package app.bravaburgers.repartidor.nativeapp.navigation.core

import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

object BravaGeo {
    fun haversineM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a =
            sin(dLat / 2).pow(2.0) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2.0)
        return 2 * r * asin(sqrt(a.coerceIn(0.0, 1.0)))
    }

    /** Adaptado de Mapbox Navigation SDK (Apache 2.0) — shortestRotationDiff */
    fun shortestRotationDiff(angleDeg: Double, anchorDeg: Double): Double {
        if (!angleDeg.isFinite() || !anchorDeg.isFinite()) return 0.0
        var raw = angleDeg - anchorDeg
        while (raw > 180) raw -= 360
        while (raw < -180) raw += 360
        return raw
    }

    fun wrapDeg(angleDeg: Double): Double {
        var a = angleDeg % 360.0
        if (a < 0) a += 360.0
        return a
    }

    /** Punto a distancia [distanceM] y bearing [bearingDeg] desde (lat, lng). */
    fun destinationPoint(
        lat: Double,
        lng: Double,
        bearingDeg: Double,
        distanceM: Double,
    ): Pair<Double, Double> {
        if (distanceM <= 0.0 || !bearingDeg.isFinite()) return Pair(lat, lng)
        val r = 6371000.0
        val br = Math.toRadians(bearingDeg)
        val lat1 = Math.toRadians(lat)
        val lng1 = Math.toRadians(lng)
        val lat2 =
            asin(
                sin(lat1) * cos(distanceM / r) +
                    cos(lat1) * sin(distanceM / r) * cos(br),
            )
        val lng2 =
            lng1 +
                atan2(
                    sin(br) * sin(distanceM / r) * cos(lat1),
                    cos(distanceM / r) - sin(lat1) * sin(lat2),
                )
        return Pair(Math.toDegrees(lat2), Math.toDegrees(lng2))
    }
}
