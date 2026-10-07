package app.bravaburgers.repartidor.nativeapp.mapbox

import app.bravaburgers.repartidor.nativeapp.R

data class BravaNavManeuver(
    val distanceLabel: String,
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
        primaryManeuverType: String?,
        primaryModifier: String?,
        upcomingManeuverType: String?,
        upcomingModifier: String?,
        subManeuverType: String?,
        subModifier: String?,
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
        val (iconType, iconModifier) =
            resolveIconManeuver(
                primaryManeuverType,
                primaryModifier,
                upcomingManeuverType,
                upcomingModifier,
                subManeuverType,
                subModifier,
            )
        val primaryIcon = iconFor(iconType, iconModifier, primary)
        val thenIcon =
            iconFor(
                subManeuverType,
                subModifier,
                then ?: primary,
            )
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

    private fun norm(value: String?): String =
        value?.lowercase()?.replace('_', ' ')?.trim().orEmpty()

    private fun isTurnModifier(modifier: String?): Boolean {
        when (norm(modifier)) {
            "left",
            "right",
            "sharp left",
            "sharp right",
            "slight left",
            "slight right",
            "uturn",
            "u turn",
            -> return true
        }
        val m = norm(modifier)
        if (m.contains("left") || m.contains("right")) return true
        return false
    }

    private fun isNonTurnModifier(modifier: String?): Boolean {
        val m = norm(modifier)
        return m.isEmpty() || m == "straight" || m == "continue"
    }

    /** Icono = giro real; si el banner solo nombra calle ("recto"), usar upcoming/sub. */
    private fun resolveIconManeuver(
        primaryType: String?,
        primaryMod: String?,
        upcomingType: String?,
        upcomingMod: String?,
        subType: String?,
        subMod: String?,
    ): Pair<String?, String?> {
        if (isTurnModifier(primaryMod) && !isNonTurnModifier(primaryMod)) {
            return primaryType to primaryMod
        }
        if (isTurnModifier(upcomingMod)) {
            return upcomingType to upcomingMod
        }
        if (isTurnModifier(subMod)) {
            return subType to subMod
        }
        return primaryType to primaryMod
    }

    private fun iconFor(
        type: String?,
        modifier: String?,
        fallbackText: String,
    ): Int {
        val t = norm(type)
        val mod = norm(modifier)
        val blob = "$t $mod ${fallbackText.lowercase()}"

        if (t.contains("roundabout") || t.contains("rotary") || blob.contains("rotonda")) {
            return R.drawable.ic_brava_maneuver_roundabout
        }

        when (mod) {
            "uturn", "u turn" -> return R.drawable.ic_brava_maneuver_uturn
            "sharp left" -> return R.drawable.ic_brava_maneuver_sharp_left
            "sharp right" -> return R.drawable.ic_brava_maneuver_sharp_right
            "slight left" -> return R.drawable.ic_brava_maneuver_slight_left
            "slight right" -> return R.drawable.ic_brava_maneuver_slight_right
            "left" -> return R.drawable.ic_brava_maneuver_turn_left
            "right" -> return R.drawable.ic_brava_maneuver_turn_right
            "straight" -> return R.drawable.ic_brava_maneuver_straight
        }

        if (mod.contains("uturn") || blob.contains("u-turn") || blob.contains("media vuelta")) {
            return R.drawable.ic_brava_maneuver_uturn
        }
        if (mod.contains("sharp left") || (blob.contains("cerrada") && blob.contains("izquierda"))) {
            return R.drawable.ic_brava_maneuver_sharp_left
        }
        if (mod.contains("sharp right") || (blob.contains("cerrada") && blob.contains("derecha"))) {
            return R.drawable.ic_brava_maneuver_sharp_right
        }
        if (mod.contains("slight left")) return R.drawable.ic_brava_maneuver_slight_left
        if (mod.contains("slight right")) return R.drawable.ic_brava_maneuver_slight_right
        if (mod.contains("left") || blob.contains("izquierda")) {
            return R.drawable.ic_brava_maneuver_turn_left
        }
        if (mod.contains("right") || blob.contains("derecha")) {
            return R.drawable.ic_brava_maneuver_turn_right
        }
        if (mod.contains("straight") || t.contains("merge") || t.contains("continue") || t == "depart") {
            return R.drawable.ic_brava_maneuver_straight
        }

        return when {
            blob.contains("izquierda") -> R.drawable.ic_brava_maneuver_turn_left
            blob.contains("derecha") -> R.drawable.ic_brava_maneuver_turn_right
            else -> R.drawable.ic_brava_maneuver_straight
        }
    }
}

