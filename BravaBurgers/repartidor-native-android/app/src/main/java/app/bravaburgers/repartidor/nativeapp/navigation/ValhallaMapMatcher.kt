package app.bravaburgers.repartidor.nativeapp.navigation

import app.bravaburgers.repartidor.nativeapp.data.OsrmClient
import app.bravaburgers.repartidor.nativeapp.navigation.core.BravaGeo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Map-matching **solo para el puck** (estilo Mapbox `enhancedLocation`).
 *
 * - Usa Valhalla **`/locate`** únicamente (no `trace_route` en vivo: eso re-traza y salta maniobras/voz).
 * - GPS crudo sigue en voz, reruta y off-route.
 */
class ValhallaMapMatcher(
    private val osrm: OsrmClient,
) {
    private var lastMatch: Pair<Double, Double>? = null
    private var lastMatchAtMs = 0L
    private var lastRawAtMs = 0L
    private var enabled = false

    fun setEnabled(on: Boolean) {
        enabled = on
        if (!on) reset()
    }

    fun reset() {
        lastMatch = null
        lastMatchAtMs = 0L
        lastRawAtMs = 0L
    }

    /**
     * Snap suave a calle para display. null = mantener posición actual del pipeline.
     */
    suspend fun locateForDisplay(
        rawLat: Double,
        rawLng: Double,
        speedMps: Float?,
    ): Pair<Double, Double>? {
        if (!enabled || !osrm.hasValhallaMapMatch()) return null
        val now = System.currentTimeMillis()
        if (now - lastMatchAtMs < MIN_INTERVAL_MS) {
            return lastMatch
        }
        lastRawAtMs = now
        val located =
            withContext(Dispatchers.IO) {
                osrm.valhallaLocateOnly(rawLat, rawLng)
            } ?: return lastMatch

        if (BravaGeo.haversineM(rawLat, rawLng, located.first, located.second) > MAX_SNAP_FROM_RAW_M) {
            return lastMatch
        }

        val prev = lastMatch
        if (prev != null) {
            val stepM = BravaGeo.haversineM(prev.first, prev.second, located.first, located.second)
            val maxStep = maxStepM(speedMps)
            if (stepM > maxStep) {
                return lastMatch
            }
        }

        lastMatch = located
        lastMatchAtMs = now
        return located
    }

    private fun maxStepM(speedMps: Float?): Double {
        val v = speedMps?.coerceAtLeast(0f) ?: 0f
        val fromSpeed = v * 2.2 + 6.0
        return fromSpeed.coerceIn(8.0, 55.0)
    }

    companion object {
        private const val MIN_INTERVAL_MS = 750L
        private const val MAX_SNAP_FROM_RAW_M = 42.0
    }
}
