package app.bravaburgers.repartidor.nativeapp.navigation

import app.bravaburgers.repartidor.nativeapp.data.OsrmManeuverDto
import app.bravaburgers.repartidor.nativeapp.data.OsrmStepDto

/** Textos de maniobra (misma lógica que repartidor/index.html y OsrmClient). */
object OsrmNavText {
    fun maneuverText(step: OsrmStepDto?): String {
        if (step == null || step.maneuver == null) return "Seguí por la ruta resaltada"
        val m = step.maneuver
        val street = (m.name ?: step.name)?.trim().orEmpty()
        val t = m.type.orEmpty()
        val mod = m.modifier.orEmpty()
        return when {
            t == "arrive" -> "Llegaste al destino"
            t == "depart" -> "Salí hacia ${street.ifEmpty { "la ruta" }}"
            mod == "left" -> "Girá a la izquierda${if (street.isNotEmpty()) " en $street" else ""}"
            mod == "right" -> "Girá a la derecha${if (street.isNotEmpty()) " en $street" else ""}"
            mod == "slight left" -> "Mantenete a la izquierda"
            mod == "slight right" -> "Mantenete a la derecha"
            t == "roundabout" -> "Tomá la rotonda"
            t == "continue" -> "Continuá${if (street.isNotEmpty()) " por $street" else ""}"
            !m.instruction.isNullOrBlank() -> m.instruction!!.trim()
            else -> "Seguí la ruta resaltada"
        }
    }

    fun maneuverSpeechLine(step: OsrmStepDto, distanceM: Double, nowThresholdM: Double = 22.0): String {
        val m = maneuverText(step)
        if (distanceM <= nowThresholdM) return m
        val lower = m.replaceFirstChar { it.lowercase() }
        return "En ${formatDistSpeech(distanceM)}, $lower"
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
