package app.bravaburgers.repartidor.nativeapp.navigation.core

/**
 * Adaptado de Mapbox Navigation SDK (Apache 2.0)
 * — NavigationLocationProvider (keypoints + ~1s, velocidad constante).
 */
class BravaLocationAnimator(
    private val durationMs: Long = 1000L,
    private val teleportJumpM: Double = 80.0,
) {
    data class DisplaySample(
        val lat: Double,
        val lng: Double,
        val bearing: Float?,
        val atMs: Long,
    )

    private var display: DisplaySample? = null
    private var segment: Segment? = null

    private data class Segment(
        val fromLat: Double,
        val fromLng: Double,
        val toLat: Double,
        val toLng: Double,
        val startMs: Long,
        val endMs: Long,
        val bearingTo: Float?,
    )

    fun reset() {
        display = null
        segment = null
    }

    fun pushGpsFix(lat: Double, lng: Double, bearing: Float? = null, nowMs: Long = System.currentTimeMillis()) {
        val cur = display
        if (cur == null) {
            display = DisplaySample(lat, lng, bearing, nowMs)
            return
        }
        val jumpM = BravaGeo.haversineM(cur.lat, cur.lng, lat, lng)
        val duration = if (jumpM >= teleportJumpM) 0L else durationMs
        if (duration == 0L) {
            display = DisplaySample(lat, lng, bearing, nowMs)
            segment = null
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
                bearingTo = bearing,
            )
    }

    fun tick(nowMs: Long = System.currentTimeMillis()): DisplaySample? {
        val cur = display ?: return null
        val seg = segment
        if (seg == null) return cur
        val total = (seg.endMs - seg.startMs).coerceAtLeast(1)
        val t = ((nowMs - seg.startMs).toDouble() / total).coerceIn(0.0, 1.0)
        val lat = seg.fromLat + (seg.toLat - seg.fromLat) * t
        val lng = seg.fromLng + (seg.toLng - seg.fromLng) * t
        val brg = seg.bearingTo ?: cur.bearing
        val next = DisplaySample(lat, lng, brg, nowMs)
        display = next
        if (t >= 1.0) segment = null
        return next
    }
}
