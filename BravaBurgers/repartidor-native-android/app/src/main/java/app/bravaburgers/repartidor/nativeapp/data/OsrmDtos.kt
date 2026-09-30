package app.bravaburgers.repartidor.nativeapp.data

import app.bravaburgers.repartidor.nativeapp.navigation.OsrmNavText
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class OsrmResponseDto(
    val code: String? = null,
    val routes: List<OsrmRouteDto>? = null,
    val message: String? = null,
)

@JsonClass(generateAdapter = true)
data class OsrmRouteDto(
    val distance: Double? = null,
    val duration: Double? = null,
    val geometry: OsrmGeometryDto? = null,
    val legs: List<OsrmLegDto>? = null,
)

@JsonClass(generateAdapter = true)
data class OsrmGeometryDto(
    val coordinates: List<List<Double>>? = null,
)

@JsonClass(generateAdapter = true)
data class OsrmLegDto(
    val steps: List<OsrmStepDto>? = null,
)

@JsonClass(generateAdapter = true)
data class OsrmStepDto(
    val distance: Double? = null,
    val maneuver: OsrmManeuverDto? = null,
    val name: String? = null,
)

@JsonClass(generateAdapter = true)
data class OsrmManeuverDto(
    val instruction: String? = null,
    val type: String? = null,
    val modifier: String? = null,
    val name: String? = null,
    val location: List<Double>? = null,
    val exit: Int? = null,
    @com.squareup.moshi.Json(name = "bearing_after") val bearingAfter: Int? = null,
    @com.squareup.moshi.Json(name = "bearing_before") val bearingBefore: Int? = null,
)

@JsonClass(generateAdapter = true)
data class OsrmBasesResponseDto(
    val ok: Boolean = false,
    val primary: String? = null,
)

@JsonClass(generateAdapter = true)
data class AppRouteResponseDto(
    val ok: Boolean = false,
    val error: String? = null,
    val coordinates: List<RouteCoordDto>? = null,
    @com.squareup.moshi.Json(name = "distance_m") val distanceM: Double? = null,
    @com.squareup.moshi.Json(name = "duration_sec") val durationSec: Double? = null,
    val maneuver: String? = null,
    @com.squareup.moshi.Json(name = "route_source") val routeSource: String? = null,
    val steps: List<OsrmStepDto>? = null,
)

@JsonClass(generateAdapter = true)
data class RouteCoordDto(
    val lat: Double = 0.0,
    val lng: Double = 0.0,
)

data class NavStep(
    val lat: Double,
    val lng: Double,
    val dto: OsrmStepDto,
) {
    val speech: String get() = OsrmNavText.maneuverText(dto)
    val type: String get() = dto.maneuver?.type.orEmpty()
}
