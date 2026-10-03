package app.bravaburgers.repartidor.nativeapp.navigation.core

/**
 * Adaptado de Mapbox Navigation SDK (Apache 2.0)
 * — NavigationLocationProvider (keypoints + duración ~Δt GPS, velocidad constante).
 */
class BravaLocationAnimator(
    private val defaultDurationMs: Long = 1000L,
    private val teleportJumpM: Double = NavDisplayThresholds.TELEPORT_JUMP_M,
) {
    data class DisplaySample(
        val lat: Double,
        val lng: Double,
        val bearing: Float?,
        val atMs: Long,
    )

    private var display: DisplaySample? = null
    private var segment: Segment? = null
    private var lastPushAtMs: Long = 0L
    private var lastTickMs: Long = 0L
    private var coastSpeedMps: Float = 0f
    private var coastBearingDeg: Float? = null

    private data class Segment(
        val fromLat: Double,
        val fromLng: Double,
        val toLat: Double,
        val toLng: Double,
        val startMs: Long,
        val endMs: Long,
        val bearingFrom: Float?,
        val bearingTo: Float?,
    )

    fun reset() {
        display = null
        segment = null
        lastPushAtMs = 0L
        lastTickMs = 0L
        coastSpeedMps = 0f
        coastBearingDeg = null
    }

    fun displayPosition(): Pair<Double, Double>? {
        val d = display ?: return null
        return Pair(d.lat, d.lng)
    }

    fun snapTo(lat: Double, lng: Double, bearing: Float? = null, nowMs: Long = System.currentTimeMillis()) {
        display = DisplaySample(lat, lng, bearing ?: display?.bearing, nowMs)
        segment = null
        lastPushAtMs = nowMs
        lastTickMs = nowMs
        updateCoastState(bearing, null)
    }

    fun pushEnhancedFix(
        lat: Double,
        lng: Double,
        bearing: Float? = null,
        isTeleport: Boolean = false,
        speedMps: Float? = null,
        nowMs: Long = System.currentTimeMillis(),
    ) {
        if (isTeleport) {
            snapTo(lat, lng, bearing, nowMs)
            return
        }
        pushGpsFix(lat, lng, bearing, speedMps, nowMs)
    }

    fun pushGpsFix(
        lat: Double,
        lng: Double,
        bearing: Float? = null,
        speedMps: Float? = null,
        nowMs: Long = System.currentTimeMillis(),
    ) {
        updateCoastState(bearing, speedMps)
        val cur = display
        if (cur == null) {
            display = DisplaySample(lat, lng, bearing, nowMs)
            lastPushAtMs = nowMs
            lastTickMs = nowMs
            return
        }
        val jumpM = BravaGeo.haversineM(cur.lat, cur.lng, lat, lng)
        val minJumpM = minJumpThresholdM(speedMps)
        if (jumpM < minJumpM) {
            return
        }
        val duration =
            if (jumpM >= teleportJumpM) {
                0L
            } else {
                segmentDurationMs(nowMs)
            }
        if (duration == 0L) {
            display = DisplaySample(lat, lng, bearing, nowMs)
            segment = null
            lastPushAtMs = nowMs
            lastTickMs = nowMs
            return
        }
        segment =
            Segment(
                fromLat = cur.lat,
                fromLng = cur.lng,
                toLat = lat,
                toLng = lng,
                startMs = nowMs,
                endMs = nowMs + duration,
                bearingFrom = cur.bearing,
                bearingTo = bearing,
            )
        lastPushAtMs = nowMs
    }

    private fun updateCoastState(bearing: Float?, speedMps: Float?) {
        val speed = speedMps?.coerceAtLeast(0f) ?: coastSpeedMps
        coastSpeedMps = speed
        if (bearing != null && bearing.isFinite()) {
            coastBearingDeg = bearing
        }
    }

    private fun segmentDurationMs(nowMs: Long): Long {
        val dt =
            if (lastPushAtMs == 0L) {
                defaultDurationMs
            } else {
                (nowMs - lastPushAtMs).coerceIn(250L, 4000L)
            }
        return dt.coerceIn(
            NavDisplayThresholds.SEGMENT_DURATION_MIN_MS,
            NavDisplayThresholds.SEGMENT_DURATION_MAX_MS,
        )
    }

    fun tick(
        nowMs: Long = System.currentTimeMillis(),
        speedMps: Float? = null,
    ): DisplaySample? {
        val cur = display ?: return null
        val seg = segment
        if (seg != null) {
            val total = (seg.endMs - seg.startMs).coerceAtLeast(1)
            val t = ((nowMs - seg.startMs).toDouble() / total).coerceIn(0.0, 1.0)
            val lat = seg.fromLat + (seg.toLat - seg.fromLat) * t
            val lng = seg.fromLng + (seg.toLng - seg.fromLng) * t
            val brg = interpolateBearing(seg.bearingFrom, seg.bearingTo, t) ?: cur.bearing
            val next = DisplaySample(lat, lng, brg, nowMs)
            display = next
            if (t >= 1.0) segment = null
            lastTickMs = nowMs
            return next
        }

        val v = (speedMps ?: coastSpeedMps).coerceAtLeast(0f)
        val brg = coastBearingDeg ?: cur.bearing
        if (
            v >= NavDisplayThresholds.COAST_MIN_SPEED_MPS &&
            brg != null &&
            brg.isFinite()
        ) {
            val prevTick = if (lastTickMs == 0L) nowMs else lastTickMs
            val dtMs = (nowMs - prevTick).coerceIn(0L, NavDisplayThresholds.COAST_MAX_DT_MS)
            lastTickMs = nowMs
            if (dtMs > 0) {
                val distM = v * (dtMs / 1000.0)
                val (lat, lng) =
                    BravaGeo.destinationPoint(cur.lat, cur.lng, brg.toDouble(), distM)
                val next = DisplaySample(lat, lng, brg, nowMs)
                display = next
                return next
            }
        }
        lastTickMs = nowMs
        return cur
    }

    private fun interpolateBearing(from: Float?, to: Float?, t: Double): Float? {
        if (to == null) return from
        if (from == null) return to
        val delta = BravaGeo.shortestRotationDiff(to.toDouble(), from.toDouble())
        return BravaGeo.wrapDeg(from + delta * t).toFloat()
    }

    companion object {
        fun minJumpThresholdM(speedMps: Float?): Double {
            val v = speedMps?.coerceAtLeast(0f) ?: 0f
            return kotlin.math.max(1.0, kotlin.math.min(6.0, (v * 0.35).toDouble()))
        }
    }
}
