package app.bravaburgers.repartidor.nativeapp.navigation.core

import app.bravaburgers.repartidor.nativeapp.navigation.NavDriverDisplaySmoother

/**
 * Parado en casa: el GPS “camina” hacia la calle con speed inventada (~5–17 km/h).
 * No basta filtrar jitter: hay que **no desbloquear** hasta desplazamiento real sostenido.
 */
class BravaStationaryGpsController {
    private var anchor: Pair<Double, Double>? = null
    private var lastRaw: Pair<Double, Double>? = null
    private var lastRawAtMs: Long = 0L
    private var unlockStreak: Int = 0

    /** Mientras true: puck fijo en [anchor], sin snap a ruta. */
    var isLocked: Boolean = true
        private set

    fun reset() {
        anchor = null
        lastRaw = null
        lastRawAtMs = 0L
        unlockStreak = 0
        isLocked = true
    }

    data class Result(
        val displayLatLng: Pair<Double, Double>?,
        val anchor: Pair<Double, Double>?,
        val locked: Boolean,
    )

    fun onFix(
        rawLat: Double,
        rawLng: Double,
        speedMps: Float?,
        accuracyM: Float?,
    ): Result {
        val now = System.currentTimeMillis()
        val gpsMps = speedMps?.coerceAtLeast(0f) ?: 0f
        val raw = Pair(rawLat, rawLng)

        val dtSec =
            if (lastRawAtMs == 0L) {
                0.0
            } else {
                ((now - lastRawAtMs).coerceIn(200L, 4000L)) / 1000.0
            }
        val stepM =
            lastRaw?.let { (a, b) -> BravaGeo.haversineM(a, b, rawLat, rawLng) } ?: 0.0
        val computedMps = if (dtSec > 0) stepM / dtSec else 0.0

        val acc = accuracyM?.coerceAtLeast(0f) ?: 25f
        val anchorPt = anchor
        val fromAnchorM =
            anchorPt?.let { (a, b) -> BravaGeo.haversineM(a, b, rawLat, rawLng) } ?: 0.0

        // Salto instantáneo típico cuando el chip “salta” a la calle.
        val teleportM = maxOf(REJECT_TELEPORT_STEP_M, acc * 1.6)
        if (anchorPt != null && isLocked && stepM > teleportM && dtSec < 2.8) {
            rememberRaw(raw, now)
            return Result(displayLatLng = null, anchor = anchorPt, locked = true)
        }

        val physicallyMoving = isPhysicallyMoving(gpsMps, computedMps, fromAnchorM)

        if (physicallyMoving && fromAnchorM >= MIN_UNLOCK_DISPLACEMENT_M) {
            unlockStreak++
        } else {
            unlockStreak = 0
        }

        if (isLocked && unlockStreak >= UNLOCK_FIXES_REQUIRED) {
            isLocked = false
        }

        if (!isLocked && physicallyMoving) {
            anchor = raw
            rememberRaw(raw, now)
            return Result(displayLatLng = raw, anchor = raw, locked = false)
        }

        if (!isLocked && !physicallyMoving) {
            // Sigue en nav pero frenó: re-anclar sin volver a snap agresivo hasta caminar de nuevo.
            isLocked = true
            unlockStreak = 0
        }

        if (anchorPt == null) {
            anchor = raw
            isLocked = true
            rememberRaw(raw, now)
            return Result(displayLatLng = raw, anchor = raw, locked = true)
        }

        rememberRaw(raw, now)
        return Result(displayLatLng = null, anchor = anchorPt, locked = isLocked)
    }

    private fun rememberRaw(raw: Pair<Double, Double>, nowMs: Long) {
        lastRaw = raw
        lastRawAtMs = nowMs
    }

    private fun isPhysicallyMoving(
        gpsMps: Float,
        computedMps: Double,
        fromAnchorM: Double,
    ): Boolean {
        if (gpsMps < MOVING_MIN_MPS) return false
        // Speed reportada sin metros recorridos (parado en el sillón).
        if (computedMps < MIN_COMPUTED_MPS) return false
        if (gpsMps > 0.5f && computedMps < gpsMps * MIN_COMPUTED_VS_GPS_RATIO) return false
        // Aún en el punto de salida: no confiar solo en speed del chip.
        if (fromAnchorM < MIN_UNLOCK_DISPLACEMENT_M && gpsMps < HIGH_TRUST_GPS_MPS) return false
        return true
    }

    companion object {
        private val MOVING_MIN_MPS = NavDriverDisplaySmoother.MOVING_MIN_SPEED_MPS
        private const val MIN_COMPUTED_MPS = 0.85
        private const val MIN_COMPUTED_VS_GPS_RATIO = 0.28
        /** ~25 km/h: por encima confiamos en GPS aunque el paso sea corto. */
        private const val HIGH_TRUST_GPS_MPS = 7.0f
        /** Caminata mínima antes de pegar a la polyline. */
        private const val MIN_UNLOCK_DISPLACEMENT_M = 22.0
        private const val UNLOCK_FIXES_REQUIRED = 3
        private const val REJECT_TELEPORT_STEP_M = 18.0
    }
}
