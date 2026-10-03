package app.bravaburgers.repartidor.nativeapp.navigation.core

/** Umbrales compartidos matcher ↔ animador ↔ reroute. */
object NavDisplayThresholds {
    /** Snap instantáneo (matcher + animador). */
    const val TELEPORT_JUMP_M = 120.0

    const val SEGMENT_DURATION_MIN_MS = 400L
    const val SEGMENT_DURATION_MAX_MS = 1200L

    /** Reroute: deslizar puck a nueva polyline si está cerca. */
    const val REROUTE_SOFT_SNAP_MAX_M = 30.0
}
