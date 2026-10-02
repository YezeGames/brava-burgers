package app.bravaburgers.repartidor.nativeapp.navigation

/**
 * Posición **en mapa**: suave y pegada al trazado cuando estás cerca de la ruta.
 * El GPS crudo sigue usándose para voz y recálculo (ViewModel).
 */
class NavDriverDisplaySmoother {
    private var displayLat: Double? = null
    private var displayLng: Double? = null
    private var alongRouteM: Double = 0.0
    private var lastFixAtMs: Long = 0L

    fun reset() {
        displayLat = null
        displayLng = null
        alongRouteM = 0.0
        lastFixAtMs = 0L
    }

    fun mapPosition(
        gpsLat: Double,
        gpsLng: Double,
        speedMps: Float?,
        route: List<Pair<Double, Double>>,
    ): Pair<Double, Double> {
        val now = System.currentTimeMillis()
        val dtSec =
            if (lastFixAtMs == 0L) {
                0.0
            } else {
                ((now - lastFixAtMs).coerceAtMost(2500L)) / 1000.0
            }
        lastFixAtMs = now

        val speedMpsSafe = speedMps?.coerceAtLeast(0f) ?: 0f
        if (route.size < 2 || speedMpsSafe < MOVING_MIN_SPEED_MPS) {
            // En casa / parado: GPS real, sin pegar a la polyline (evita “estar en la calle”).
            val alpha = if (speedMpsSafe < 0.35f) 0.88 else 0.45
            return blendToward(gpsLat, gpsLng, alpha)
        }

        val proj = NavRouteProgress.projectOntoRoute(gpsLat, gpsLng, route)
        if (proj == null || proj.offRouteM > ON_ROUTE_MAX_OFF_M) {
            return blendToward(gpsLat, gpsLng, 0.38)
        }

        var targetAlong = proj.alongRouteM
        if (targetAlong < alongRouteM - MAX_ALONG_BACK_M) {
            targetAlong = alongRouteM - MAX_ALONG_BACK_M
        }
        val speed = speedMps?.toDouble()?.coerceAtLeast(0.0) ?: 2.5
        val maxAdvance = speed * maxOf(dtSec, 0.35) * 1.45 + 8.0
        if (targetAlong > alongRouteM + maxAdvance) {
            targetAlong = alongRouteM + maxAdvance
        }

        val alongAlpha = (0.38 + speed * 0.06).coerceIn(0.32, 0.78)
        alongRouteM += (targetAlong - alongRouteM) * alongAlpha

        val onRoute =
            NavRouteProgress.pointAtAlongRoute(alongRouteM, route)
                ?: Pair(proj.lat, proj.lng)
        return blendToward(onRoute.first, onRoute.second, 0.62)
    }

    fun displayBearing(route: List<Pair<Double, Double>>): Float? {
        if (route.size < 2 || alongRouteM <= 0.0) return null
        return NavRouteProgress.travelBearingDeg(route, alongRouteM)?.toFloat()
    }

    private fun blendToward(lat: Double, lng: Double, alpha: Double): Pair<Double, Double> {
        val prevLat = displayLat
        val prevLng = displayLng
        if (prevLat == null || prevLng == null) {
            displayLat = lat
            displayLng = lng
            return Pair(lat, lng)
        }
        val a = alpha.coerceIn(0.08, 1.0)
        val outLat = prevLat + (lat - prevLat) * a
        val outLng = prevLng + (lng - prevLng) * a
        displayLat = outLat
        displayLng = outLng
        return Pair(outLat, outLng)
    }

    companion object {
        /** ~5 km/h: por debajo no snap a ruta. */
        const val MOVING_MIN_SPEED_MPS = 1.45f
        private const val ON_ROUTE_MAX_OFF_M = 48.0
        private const val MAX_ALONG_BACK_M = 5.0
    }
}
