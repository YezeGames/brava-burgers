package app.bravaburgers.repartidor.nativeapp.data

import app.bravaburgers.repartidor.nativeapp.BuildConfig
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

data class RouteResult(
    val coordinates: List<Pair<Double, Double>>,
    val distanceM: Double,
    val durationSec: Double,
    val firstManeuver: String,
)

@JsonClass(generateAdapter = true)
private data class OsrmResponse(
    val code: String? = null,
    val routes: List<OsrmRoute>? = null,
    val message: String? = null,
)

@JsonClass(generateAdapter = true)
private data class OsrmRoute(
    val distance: Double? = null,
    val duration: Double? = null,
    val geometry: OsrmGeometry? = null,
    val legs: List<OsrmLeg>? = null,
)

@JsonClass(generateAdapter = true)
private data class OsrmGeometry(
    val coordinates: List<List<Double>>? = null,
)

@JsonClass(generateAdapter = true)
private data class OsrmLeg(
    val steps: List<OsrmStep>? = null,
)

@JsonClass(generateAdapter = true)
private data class OsrmStep(
    val distance: Double? = null,
    val maneuver: OsrmManeuver? = null,
    val name: String? = null,
)

@JsonClass(generateAdapter = true)
private data class OsrmManeuver(
    val instruction: String? = null,
    val type: String? = null,
    val modifier: String? = null,
)

class OsrmClient {
    private val http =
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

    private val moshi =
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()

    private val adapter = moshi.adapter(OsrmResponse::class.java)

    fun fetchDrivingRoute(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult> {
        val base = BuildConfig.OSRM_BASE.trimEnd('/')
        val path = "$fromLng,$fromLat;$toLng,$toLat"
        val url =
            "$base/$path?overview=full&geometries=geojson&steps=true&language=es"
        return try {
            val req = Request.Builder().url(url).get().build()
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    return Result.failure(Exception("osrm_http_${resp.code}"))
                }
                val body = resp.body?.string() ?: return Result.failure(Exception("osrm_empty"))
                val parsed = adapter.fromJson(body) ?: return Result.failure(Exception("osrm_parse"))
                if (parsed.code != "Ok" || parsed.routes.isNullOrEmpty()) {
                    return Result.failure(Exception(parsed.message ?: "osrm_no_route"))
                }
                val route = parsed.routes.first()
                val coords =
                    route.geometry?.coordinates?.mapNotNull { pair ->
                        if (pair.size >= 2) Pair(pair[1], pair[0]) else null
                    }.orEmpty()
                val step = route.legs?.firstOrNull()?.steps?.firstOrNull()
                val maneuver =
                    step?.maneuver?.instruction?.trim()?.takeIf { it.isNotEmpty() }
                        ?: buildManeuverFallback(step)
                Result.success(
                    RouteResult(
                        coordinates = coords,
                        distanceM = route.distance ?: 0.0,
                        durationSec = route.duration ?: 0.0,
                        firstManeuver = maneuver,
                    ),
                )
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun buildManeuverFallback(step: OsrmStep?): String {
        if (step == null) return "Seguí la ruta resaltada"
        val street = step.name?.takeIf { it.isNotBlank() } ?: "la calle"
        return "Continuá hacia $street"
    }
}
