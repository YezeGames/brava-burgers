package app.bravaburgers.repartidor.nativeapp.mapbox

import app.bravaburgers.repartidor.nativeapp.R

data class BravaNavManeuver(
    val primaryLine: String,
    val thenLine: String?,
    val primaryIconRes: Int,
    val thenIconRes: Int,
)

object BravaNavManeuverFormat {
    fun fromBanner(
        primaryText: String?,
        subText: String?,
        distanceMeters: Double?,
        maneuverType: String?,
        modifier: String?,
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
            if (dist != null && !primary.contains(dist, ignoreCase = true)) {
                "$primary · $dist"
            } else {
                primary
            }
        val then = subText?.trim()?.takeIf { it.isNotEmpty() }
        val icon = iconFor(maneuverType, modifier, primary)
        return BravaNavManeuver(
            primaryLine = main,
            thenLine = then,
            primaryIconRes = icon,
            thenIconRes = R.drawable.ic_brava_maneuver_turn_right,
        )
    }

    private fun iconFor(
        type: String?,
        modifier: String?,
        fallbackText: String,
    ): Int {
        val blob = "${type.orEmpty()} ${modifier.orEmpty()} $fallbackText".lowercase()
        return when {
            blob.contains("uturn") || blob.contains("u-turn") -> R.drawable.ic_brava_maneuver_turn_left
            blob.contains("left") || blob.contains("izquierda") -> R.drawable.ic_brava_maneuver_turn_left
            blob.contains("right") || blob.contains("derecha") -> R.drawable.ic_brava_maneuver_turn_right
            else -> R.drawable.ic_brava_maneuver_straight
        }
    }
}
