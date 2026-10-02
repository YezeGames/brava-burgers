package app.bravaburgers.repartidor.nativeapp.navigation.core

/**
 * Subconjunto de [com.mapbox.navigation.core.trip.session.LocationMatcherResult]
 * (Mapbox Navigation Android, Apache 2.0) — solo lo que usa Brava sin el matcher nativo.
 *
 * @param isTeleport si true, el puck no debe deslizarse desde el punto anterior (duración 0).
 * @param isDegradedMatching true en “parado en salida”: enhanced ≈ ancla, sin snap agresivo a ruta.
 */
data class BravaLocationMatcherResult(
    val enhancedLat: Double,
    val enhancedLng: Double,
    val bearing: Float?,
    val isTeleport: Boolean,
    val isDegradedMatching: Boolean,
)
