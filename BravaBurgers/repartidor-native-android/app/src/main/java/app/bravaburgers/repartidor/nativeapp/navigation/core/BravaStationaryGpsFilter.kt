package app.bravaburgers.repartidor.nativeapp.navigation.core

import app.bravaburgers.repartidor.nativeapp.navigation.NavDriverDisplaySmoother

/**
 * Parado (casa / semáforo): el GPS sigue “bailando” 50–200 m.
 * Mapbox no anima el puck con eso ([LocationMatcherResult.isTeleport] / matcher estable).
 * Acá: **no** movemos display si no hay movimiento real.
 */
object BravaStationaryGpsFilter {
    /** Por debajo: considerado parado (m/s). */
    private val movingMinMps = NavDriverDisplaySmoother.MOVING_MIN_SPEED_MPS

    /** Salto con speed 0 → fix espurio, ignorar. */
    private const val REJECT_JUMP_STATIONARY_M = 35.0

    /** Si accuracy reportada es peor que esto, confiar menos en el fix. */
    private const val POOR_ACCURACY_M = 48f

    data class Result(
        /** null = no actualizar animador / puck */
        val displayLatLng: Pair<Double, Double>?,
        val anchor: Pair<Double, Double>?,
    )

    fun apply(
        rawLat: Double,
        rawLng: Double,
        speedMps: Float?,
        accuracyM: Float?,
        anchor: Pair<Double, Double>?,
    ): Result {
        val speed = speedMps?.coerceAtLeast(0f) ?: 0f
        val moving = speed >= movingMinMps
        val raw = Pair(rawLat, rawLng)

        if (moving) {
            return Result(displayLatLng = raw, anchor = raw)
        }

        val acc = accuracyM?.coerceAtLeast(0f) ?: 25f
        if (anchor == null) {
            return Result(displayLatLng = raw, anchor = raw)
        }

        val driftM = BravaGeo.haversineM(anchor.first, anchor.second, rawLat, rawLng)
        val rejectRadius =
            maxOf(
                REJECT_JUMP_STATIONARY_M,
                if (acc > POOR_ACCURACY_M) acc * 1.8 else acc * 1.2,
            ).toDouble()

        if (driftM > rejectRadius) {
            return Result(displayLatLng = null, anchor = anchor)
        }

        return Result(displayLatLng = null, anchor = anchor)
    }
}
