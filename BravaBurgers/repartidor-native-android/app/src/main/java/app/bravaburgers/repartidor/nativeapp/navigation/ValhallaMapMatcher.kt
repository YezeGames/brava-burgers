package app.bravaburgers.repartidor.nativeapp.navigation

import app.bravaburgers.repartidor.nativeapp.data.OsrmClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.ArrayDeque

/**
 * Map-matching Valhalla en vivo: buffer de fixes → trace_route (map_snap) o /locate.
 * Progreso e instrucciones usan la posición **en calle**, no el GPS crudo.
 */
class ValhallaMapMatcher(
    private val osrm: OsrmClient,
) {
    private val trail = ArrayDeque<Pair<Double, Double>>(MAX_TRAIL)
    private var lastMatch: Pair<Double, Double>? = null
    private var lastMatchAtMs = 0L
    private var enabled = false

    fun setEnabled(on: Boolean) {
        enabled = on
        if (!on) reset()
    }

    fun reset() {
        trail.clear()
        lastMatch = null
        lastMatchAtMs = 0L
    }

    fun recordRawFix(lat: Double, lng: Double) {
        if (trail.isNotEmpty()) {
            val prev = trail.last()
            if (kotlin.math.abs(prev.first - lat) + kotlin.math.abs(prev.second - lng) < 1e-6) {
                return
            }
        }
        if (trail.size >= MAX_TRAIL) trail.removeFirst()
        trail.addLast(Pair(lat, lng))
    }

    /** Posición para mapa / voz; null = usar GPS crudo. */
    suspend fun matchedPosition(lat: Double, lng: Double): Pair<Double, Double>? {
        if (!enabled || !osrm.hasValhallaService()) return null
        recordRawFix(lat, lng)
        val now = System.currentTimeMillis()
        if (now - lastMatchAtMs < MIN_INTERVAL_MS) {
            return null
        }
        val trailList = trail.toList()
        val out =
            withContext(Dispatchers.IO) {
                osrm.valhallaMapMatch(trailList, lat, lng)
            }
        if (out != null) {
            lastMatch = out
            lastMatchAtMs = now
        }
        return out
    }

    companion object {
        private const val MAX_TRAIL = 8
        private const val MIN_INTERVAL_MS = 650L
    }
}
