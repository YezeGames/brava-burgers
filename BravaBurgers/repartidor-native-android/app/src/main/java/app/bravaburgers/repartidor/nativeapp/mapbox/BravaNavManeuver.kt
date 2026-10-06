package app.bravaburgers.repartidor.nativeapp.mapbox

import app.bravaburgers.repartidor.nativeapp.R

data class BravaNavManeuver(
    /** Distancia al giro, estilo DiDi: "144 m" */
    val distanceLabel: String,
    /** Calle / maniobra: "Rotonda", "Doctor Barreiro Aguirre", etc. */
    val streetLabel: String,
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
        val locale = java.util.Locale("es", "AR")
        val dist =
            distanceMeters?.takeIf { it > 0 }?.let { m ->
                if (m >= 1000) {
                    String.format(locale, "%.1f km", m / 1000.0)
                } else {
                    "${m.toInt()} m"
                }
            } ?: "—"
        val street = streetFromPrimary(primary)
        val then = subText?.trim()?.takeIf { it.isNotEmpty() }
        val primaryIcon = iconFor(maneuverType, modifier, primary)
        val thenIcon = iconFor(null, null, then ?: primary)
        return BravaNavManeuver(
            distanceLabel = dist,
            streetLabel = street,
            thenLine = then,
            primaryIconRes = primaryIcon,
            thenIconRes = thenIcon,
        )
    }

    private fun streetFromPrimary(primary: String): String {
        var s =
            primary
                .trim()
                .replace(Regex("""[•·]\s*\d[\d.,]*\s*(m|km)\b.*$""", RegexOption.IGNORE_CASE), "")
                .trim()
        s = s.substringBefore(" · ").substringBefore(" • ").trim()
        return s.ifEmpty { primary.trim() }
    }

    private fun iconFor(
        type: String?,
        modifier: String?,
        fallbackText: String,
    ): Int {
        val t = type?.lowercase()?.replace('_', ' ')?.trim().orEmpty()
        val mod = modifier?.lowercase()?.replace('_', ' ')?.trim().orEmpty()
        val blob = "$t $mod ${fallbackText.lowercase()}"

        if (t.contains("roundabout") || t.contains("rotary") || blob.contains("rotonda")) {
            return R.drawable.ic_brava_maneuver_roundabout
        }
        if (mod.contains("uturn") || mod.contains("u turn") || blob.contains("u-turn")) {
            return R.drawable.ic_brava_maneuver_uturn
        }
        when {
            mod.contains("sharp left") || (blob.contains("cerrada") && blob.contains("izquierda")) ->
                return R.drawable.ic_brava_maneuver_sharp_left
            mod.contains("sharp right") || (blob.contains("cerrada") && blob.contains("derecha")) ->
                return R.drawable.ic_brava_maneuver_sharp_right
            mod.contains("slight left") || mod == "left" && t.contains("fork") ->
                return R.drawable.ic_brava_maneuver_slight_left
            mod.contains("slight right") || mod == "right" && t.contains("fork") ->
                return R.drawable.ic_brava_maneuver_slight_right
            mod.contains("left") || blob.contains("izquierda") ->
                return R.drawable.ic_brava_maneuver_turn_left
            mod.contains("right") || blob.contains("derecha") ->
                return R.drawable.ic_brava_maneuver_turn_right
            mod.contains("straight") || t.contains("merge") || t.contains("continue") ->
                return R.drawable.ic_brava_maneuver_straight
        }
        return when {
            blob.contains("izquierda") -> R.drawable.ic_brava_maneuver_turn_left
            blob.contains("derecha") -> R.drawable.ic_brava_maneuver_turn_right
            else -> R.drawable.ic_brava_maneuver_straight
        }
    }
}
