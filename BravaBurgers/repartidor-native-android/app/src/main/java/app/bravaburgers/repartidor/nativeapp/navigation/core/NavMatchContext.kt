package app.bravaburgers.repartidor.nativeapp.navigation.core

/** Progreso de ruta para snap al step (MapLibre SnapToRoute). */
data class NavMatchContext(
    val maneuverAlongM: DoubleArray,
    val stepIndex: Int,
)
