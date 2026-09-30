package app.bravaburgers.repartidor.nativeapp.data

import app.bravaburgers.repartidor.nativeapp.navigation.OsrmNavText
import org.json.JSONArray
import org.json.JSONObject

/** Trip Valhalla → RouteResult (shape real + maniobras en begin_shape_index). */
object ValhallaRouteParser {
    fun parse(body: String, sourceTag: String = "Valhalla"): Result<RouteResult> {
        return try {
            val root = JSONObject(body)
            if (root.has("error")) {
                return Result.failure(Exception(root.optString("error_message", "valhalla_error")))
            }
            val trip = root.optJSONObject("trip") ?: return Result.failure(Exception("valhalla_no_trip"))
            val legs = trip.optJSONArray("legs") ?: return Result.failure(Exception("valhalla_no_legs"))
            if (legs.length() == 0) return Result.failure(Exception("valhalla_empty_legs"))

            var shapeCoords = emptyList<Pair<Double, Double>>()
            val steps = mutableListOf<NavStep>()
            for (li in 0 until legs.length()) {
                val leg = legs.getJSONObject(li)
                var legCoords = ValhallaPolyline.decode(leg.optString("shape", ""))
                if (li > 0 && legCoords.isNotEmpty() && shapeCoords.isNotEmpty()) {
                    val last = shapeCoords.last()
                    val first = legCoords.first()
                    if (kotlin.math.abs(last.first - first.first) < 1e-7 &&
                        kotlin.math.abs(last.second - first.second) < 1e-7
                    ) {
                        legCoords = legCoords.drop(1)
                    }
                }
                val maneuvers = leg.optJSONArray("maneuvers") ?: JSONArray()
                for (mi in 0 until maneuvers.length()) {
                    val m = maneuvers.getJSONObject(mi)
                    val localIdx =
                        (m.optInt("begin_shape_index", 0)).coerceIn(0, (legCoords.size - 1).coerceAtLeast(0))
                    val pt = legCoords.getOrNull(localIdx) ?: continue
                    val dto = maneuverToOsrmStep(m, pt)
                    steps.add(NavStep(lat = pt.first, lng = pt.second, dto = dto))
                }
                shapeCoords = shapeCoords + legCoords
            }

            if (shapeCoords.size < 2) {
                return Result.failure(Exception("valhalla_empty_shape"))
            }

            val summary = trip.optJSONObject("summary")
            val distM =
                summary?.optDouble("length")?.times(1000.0)
                    ?: polylineLengthM(shapeCoords)
            val durSec = summary?.optDouble("time") ?: 0.0
            val firstStep = steps.firstOrNull()?.dto

            Result.success(
                RouteResult(
                    coordinates = shapeCoords,
                    distanceM = distM,
                    durationSec = durSec,
                    firstManeuver = OsrmNavText.maneuverText(firstStep),
                    steps = steps,
                    sourceTag = sourceTag,
                ),
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun maneuverToOsrmStep(m: JSONObject, pt: Pair<Double, Double>): OsrmStepDto {
        val mapped = ValhallaManeuverMap.toOsrm(m.optInt("type", 0))
        val street =
            m.optJSONArray("street_names")?.optString(0)?.takeIf { it.isNotBlank() }
                ?: m.optJSONArray("begin_street_names")?.optString(0)?.takeIf { it.isNotBlank() }
                ?: ""
        val exit = m.optInt("roundabout_exit_count", 0).takeIf { it > 0 }
        return OsrmStepDto(
            distance = m.optDouble("length", 0.0) * 1000.0,
            name = street,
            maneuver =
                OsrmManeuverDto(
                    type = mapped.first,
                    modifier = mapped.second,
                    instruction = m.optString("verbal_pre_transition_instruction").ifBlank {
                        m.optString("instruction")
                    },
                    name = street,
                    location = listOf(pt.second, pt.first),
                    exit = exit,
                ),
        )
    }

    private fun polylineLengthM(coords: List<Pair<Double, Double>>): Double {
        if (coords.size < 2) return 0.0
        var sum = 0.0
        for (i in 1 until coords.size) {
            sum += haversineM(coords[i - 1], coords[i])
        }
        return sum
    }

    private fun haversineM(a: Pair<Double, Double>, b: Pair<Double, Double>): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(b.first - a.first)
        val dLng = Math.toRadians(b.second - a.second)
        val lat1 = Math.toRadians(a.first)
        val lat2 = Math.toRadians(b.first)
        val x =
            kotlin.math.sin(dLat / 2) * kotlin.math.sin(dLat / 2) +
                kotlin.math.cos(lat1) * kotlin.math.cos(lat2) *
                kotlin.math.sin(dLng / 2) * kotlin.math.sin(dLng / 2)
        return 2 * r * kotlin.math.asin(kotlin.math.sqrt(x.coerceIn(0.0, 1.0)))
    }
}
