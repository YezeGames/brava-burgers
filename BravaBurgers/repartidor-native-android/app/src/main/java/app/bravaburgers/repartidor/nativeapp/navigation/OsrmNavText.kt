package app.bravaburgers.repartidor.nativeapp.navigation

import app.bravaburgers.repartidor.nativeapp.data.NavStep
import app.bravaburgers.repartidor.nativeapp.data.OsrmManeuverDto
import app.bravaburgers.repartidor.nativeapp.data.OsrmStepDto

/** Textos de maniobra estilo navegador (OSRM → pantalla / TTS). */
object OsrmNavText {
    fun maneuverText(step: OsrmStepDto?): String {
        if (step == null || step.maneuver == null) return "Seguí por la ruta resaltada"
        val m = step.maneuver
        val street = (m.name ?: step.name)?.trim().orEmpty()
        val t = m.type.orEmpty()
        val mod = m.modifier.orEmpty()
        return when {
            t == "arrive" -> "Llegaste a tu destino"
            t == "depart" -> departPhrase(street, m.bearingAfter)
            t == "roundabout" -> roundaboutPhrase(m.exit, street)
            t == "rotary" -> roundaboutPhrase(m.exit, street)
            mod == "sharp left" -> turnPhrase(left = true, sharp = true, slight = false, street)
            mod == "left" -> turnPhrase(left = true, sharp = false, slight = false, street)
            mod == "sharp right" -> turnPhrase(left = false, sharp = true, slight = false, street)
            mod == "right" -> turnPhrase(left = false, sharp = false, slight = false, street)
            mod == "slight left" -> keepLanePhrase(left = true, street)
            mod == "slight right" -> keepLanePhrase(left = false, street)
            mod == "uturn" -> "Hacé un giro en U"
            t == "fork" && mod == "left" -> "En la bifurcación, tomá a la izquierda"
            t == "fork" && mod == "right" -> "En la bifurcación, tomá a la derecha"
            t == "merge" -> if (street.isNotEmpty()) "Incorporate a $street" else "Incorporate a la vía"
            t == "off ramp" && mod.contains("right") -> "Tomá la salida a la derecha${streetTowards(street)}"
            t == "off ramp" && mod.contains("left") -> "Tomá la salida a la izquierda${streetTowards(street)}"
            t == "continue" && street.isNotEmpty() -> "Permanecé en $street"
            t == "new name" && street.isNotEmpty() -> "Continuá por $street"
            t == "end of road" && mod == "right" -> "Al final de la calle, girá a la derecha"
            t == "end of road" && mod == "left" -> "Al final de la calle, girá a la izquierda"
            t == "turn" && mod == "right" -> turnPhrase(left = false, sharp = false, slight = false, street)
            t == "turn" && mod == "left" -> turnPhrase(left = true, sharp = false, slight = false, street)
            else -> ""
        }.ifBlank {
            when {
                !m.instruction.isNullOrBlank() -> localizeOsrmInstruction(m.instruction!!.trim())
                else -> "Seguí la ruta"
            }
        }
    }

    /** Evita leer en voz cada micro-paso "continuá". */
    fun isLowValueManeuver(step: OsrmStepDto?): Boolean {
        if (step?.maneuver == null) return false
        val t = step.maneuver.type.orEmpty()
        val mod = step.maneuver.modifier.orEmpty()
        return t == "depart" || t == "continue" || (t == "new name" && mod.isEmpty())
    }

    /** Índice del próximo giro / rotonda / llegada (no el "seguí recto" intermedio). */
    fun significantStepIndex(steps: List<NavStep>, rawIndex: Int): Int {
        if (steps.isEmpty()) return 0
        var i = rawIndex.coerceIn(0, steps.lastIndex)
        while (i < steps.lastIndex && isLowValueManeuver(steps[i].dto)) {
            i++
        }
        return i
    }

    fun maneuverVoiceKey(step: OsrmStepDto?): String {
        if (step?.maneuver == null) return "?"
        val m = step.maneuver
        val street = (m.name ?: step.name)?.trim().orEmpty()
        return "${m.type}|${m.modifier}|${m.exit}|$street"
    }

    /** Texto principal en pantalla (con distancia integrada, como Maps). */
    fun displayInstruction(step: OsrmStepDto?, distanceToM: Int?): String {
        val core = maneuverText(step)
        if (core.isBlank()) return "Seguí la ruta resaltada"
        val d = distanceToM ?: return core
        if (d <= 35) return core
        val lower = core.replaceFirstChar { it.lowercase() }
        return "En ${formatDistSpeech(d.toDouble())}, $lower"
    }

    fun voiceAheadLine(step: OsrmStepDto, distanceM: Double): String {
        val d = kotlin.math.round(distanceM).toInt().coerceAtLeast(1)
        return displayInstruction(step, d)
    }

    /** Llegada al cliente (lado estimado por GPS + sentido de la ruta). */
    fun arrivePhrase(
        clientLabel: String?,
        side: NavArrivalSide.Side?,
    ): String {
        val who = clientLabel?.trim()?.takeIf { it.isNotEmpty() }
        val base =
            when {
                who != null -> "Llegaste al domicilio de $who"
                else -> "Llegaste a tu destino"
            }
        val lateral =
            when (side) {
                NavArrivalSide.Side.RIGHT -> "Tu destino está a la derecha"
                NavArrivalSide.Side.LEFT -> "Tu destino está a la izquierda"
                null -> null
            }
        return if (lateral != null) "$base. $lateral" else base
    }

    /** Si ya avisamos "En X metros…", al ejecutar no repetimos la misma frase entera. */
    fun voiceNowLine(step: OsrmStepDto, previewSpoken: Boolean): String {
        if (!previewSpoken) return maneuverText(step)
        val m = step.maneuver ?: return maneuverText(step)
        val street = (m.name ?: step.name)?.trim().orEmpty()
        val mod = m.modifier.orEmpty()
        val t = m.type.orEmpty()
        if (t == "roundabout" || t == "rotary") {
            return if (m.exit != null && m.exit > 0) {
                "Ahora, salida ${ordinalEs(m.exit)}"
            } else {
                "Ahora, la rotonda"
            }
        }
        if (t == "arrive") return "Llegaste a tu destino"
        if (street.isNotEmpty() && (mod.contains("right") || mod.contains("left"))) {
            return "Después, $street"
        }
        return when (mod) {
            "right", "sharp right" -> "Ahora, a la derecha"
            "left", "sharp left" -> "Ahora, a la izquierda"
            "slight right" -> "Mantenete a la derecha"
            "slight left" -> "Mantenete a la izquierda"
            "uturn" -> "Retorno, ahora"
            else -> if (street.isNotEmpty()) "Entrá en $street" else maneuverText(step)
        }
    }

    private fun streetSuffix(street: String): String =
        if (street.isNotEmpty()) " en $street" else ""

    private fun streetTowards(street: String): String =
        if (street.isNotEmpty()) " hacia $street" else ""

    private fun departPhrase(street: String, bearingAfter: Int?): String {
        val head = bearingCardinalEs(bearingAfter)
        return when {
            street.isNotEmpty() && head != null -> "Dirigite hacia el $head por $street"
            street.isNotEmpty() -> "Salí por $street"
            head != null -> "Dirigite hacia el $head"
            else -> "Iniciá el recorrido"
        }
    }

    private fun roundaboutPhrase(exit: Int?, street: String): String {
        val n = exit ?: 0
        return if (n > 0) {
            "En la rotonda, tomá la ${ordinalEs(n)} salida${streetTowards(street)}"
        } else {
            "Entrá a la rotonda${streetSuffix(street)}"
        }
    }

    private fun turnPhrase(left: Boolean, sharp: Boolean, slight: Boolean, street: String): String {
        val side = if (left) "izquierda" else "derecha"
        return when {
            sharp && street.isNotEmpty() ->
                "Girá a la $side en ángulo cerrado hacia $street"
            sharp -> "Girá a la $side en ángulo cerrado"
            slight && street.isNotEmpty() -> "Girá levemente a la $side en $street"
            slight -> "Girá levemente a la $side"
            street.isNotEmpty() -> "Girá a la $side en $street"
            else -> "Girá a la $side"
        }
    }

    private fun keepLanePhrase(left: Boolean, street: String): String {
        val side = if (left) "izquierda" else "derecha"
        return if (street.isNotEmpty()) {
            "Mantenete a la $side hacia $street"
        } else {
            "Mantenete a la $side"
        }
    }

    private fun ordinalEs(n: Int): String =
        when (n) {
            1 -> "primera"
            2 -> "segunda"
            3 -> "tercera"
            4 -> "cuarta"
            5 -> "quinta"
            else -> "$n.ª"
        }

    private fun bearingCardinalEs(bearing: Int?): String? {
        if (bearing == null) return null
        val b = ((bearing % 360) + 360) % 360
        return when (((b + 22.5) / 45.0).toInt() % 8) {
            0 -> "norte"
            1 -> "noreste"
            2 -> "este"
            3 -> "sureste"
            4 -> "sur"
            5 -> "suroeste"
            6 -> "oeste"
            else -> "noroeste"
        }
    }

    /** OSRM suele devolver instrucciones en inglés; no las leemos crudas si parecen EN. */
    private fun localizeOsrmInstruction(raw: String): String {
        val s = raw.trim()
        if (s.isEmpty()) return "Seguí la ruta"
        if (Regex("""^(Turn|Continue|Head|Merge|Enter|Take|Keep|Exit|Arrive)\b""", RegexOption.IGNORE_CASE).containsMatchIn(s)) {
            return "Seguí la ruta"
        }
        return s
    }

    fun formatDistSpeech(m: Double): String {
        val r =
            when {
                m >= 1000 -> Math.round(m / 100.0) * 100.0
                m >= 200 -> Math.round(m / 50.0) * 50.0
                m >= 80 -> Math.round(m / 10.0) * 10.0
                else -> Math.max(10.0, Math.round(m / 5.0) * 5.0)
            }
        if (r >= 1000) {
            val km = r / 1000.0
            if (km >= 2) return "${km.toInt()} kilómetros"
            val km1 = String.format("%.1f", km).replace(".0", "")
            return "$km1 ${if (km1 == "1") "kilómetro" else "kilómetros"}"
        }
        return "${r.toInt()} metros"
    }
}
