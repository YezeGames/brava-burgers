package app.bravaburgers.repartidor.nativeapp.data

/** Valhalla maneuver.type → (type, modifier) estilo OSRM para OsrmNavText. */
object ValhallaManeuverMap {
    fun toOsrm(type: Int): Pair<String, String> =
        when (type) {
            1, 2, 3 -> "depart" to ""
            4 -> "arrive" to ""
            5 -> "arrive" to "right"
            6 -> "arrive" to "left"
            8, 22 -> "continue" to ""
            9 -> "turn" to "slight right"
            10 -> "turn" to "right"
            11 -> "turn" to "sharp right"
            12, 13 -> "turn" to "uturn"
            14 -> "turn" to "sharp left"
            15 -> "turn" to "left"
            16 -> "turn" to "slight left"
            18, 20 -> "off ramp" to "right"
            19, 21 -> "off ramp" to "left"
            25 -> "merge" to ""
            26 -> "roundabout" to ""
            27 -> "roundabout" to "exit"
            else -> "turn" to ""
        }
}
