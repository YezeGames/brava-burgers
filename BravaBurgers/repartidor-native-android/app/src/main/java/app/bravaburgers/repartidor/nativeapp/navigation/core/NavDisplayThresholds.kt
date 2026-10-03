package app.bravaburgers.repartidor.nativeapp.navigation.core

/** Umbrales compartidos matcher ↔ animador ↔ reroute. */
object NavDisplayThresholds {
    /** Snap instantáneo (matcher + animador). */
    const val TELEPORT_JUMP_M = 120.0

    const val SEGMENT_DURATION_MIN_MS = 400L
    const val SEGMENT_DURATION_MAX_MS = 1200L

    /** Reroute: deslizar puck a nueva polyline si está cerca. */
    const val REROUTE_SOFT_SNAP_MAX_M = 30.0

    /** Step-snap / proyección: no pegar a calles paralelas (alpha54). */
    const val MAX_SNAP_OFF_ROUTE_M = 15.0
    const val MAX_SNAP_OFF_ROUTE_ACCURACY_FACTOR = 0.6
    const val MAX_SNAP_OFF_ROUTE_MIN_M = 3.0

    /** Tras cargar ruta: GPS lejos de polyline → un reroute correctivo. */
    const val ROUTE_ORIGIN_MISMATCH_M = 15.0

    /** Rechazar snap si bearing ruta vs GPS difiere demasiado. */
    const val BEARING_ROUTE_GPS_MAX_DELTA_DEG = 55.0

    /** Ventana post–onRouteLoaded con matcher estricto. */
    const val NAV_STARTUP_STRICT_MS = 20_000L

    /** Heading Valhalla origen (independiente de MOVING_MIN_SPEED_MPS). */
    const val HEADING_MIN_SPEED_MPS = 0.8f

    /** Cámara / giro: congelar bearing por debajo de ~3 km/h. */
    const val FREEZE_BEARING_MAX_SPEED_MPS = 0.8f

    /** Dead reckoning entre fixes GPS (~60 FPS). */
    const val COAST_MIN_SPEED_MPS = 1.45f
    const val COAST_MAX_DT_MS = 120L

    /** Tras reroute: no aplicar `/locate` async un rato. */
    const val VALHALLA_LOCATE_MUTE_AFTER_REROUTE_MS = 8_000L
}
