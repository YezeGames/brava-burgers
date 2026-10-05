package app.bravaburgers.repartidor.nativeapp.mapbox

data class BravaNavManeuver(
    val primaryLine: String,
    val thenLine: String?,
)

object BravaNavManeuverFormat {
    fun fromBanner(
        primaryText: String?,
        subText: String?,
        distanceMeters: Double?,
    ): BravaNavManeuver? {
        val primary = primaryText?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val dist =
            distanceMeters?.takeIf { it > 0 }?.let { m ->
                if (m >= 1000) {
                    String.format(java.util.Locale("es", "AR"), "%.1f km", m / 1000.0)
                } else {
                    "${m.toInt()} m"
                }
            }
        val main =
            if (dist != null && !primary.contains(dist)) {
                "$primary · $dist"
            } else {
                primary
            }
        val then = subText?.trim()?.takeIf { it.isNotEmpty() }
        return BravaNavManeuver(main, then)
    }
}
