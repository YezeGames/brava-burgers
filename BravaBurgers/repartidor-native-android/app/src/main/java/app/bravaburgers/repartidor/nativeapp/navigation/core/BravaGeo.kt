package app.bravaburgers.repartidor.nativeapp.navigation.core

import kotlin.math.asin
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
}
