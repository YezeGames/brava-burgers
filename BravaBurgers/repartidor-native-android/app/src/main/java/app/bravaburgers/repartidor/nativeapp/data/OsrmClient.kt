package app.bravaburgers.repartidor.nativeapp.data

import app.bravaburgers.repartidor.nativeapp.BuildConfig
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class RouteResult(
    val coordinates: List<Pair<Double, Double>>,
    val distanceM: Double,
    val durationSec: Double,
    val firstManeuver: String,
    val estimated: Boolean = false,
)

@JsonClass(generateAdapter = true)
private data class AppRouteResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val coordinates: List<RouteCoord>? = null,
    @Json(name = "distance_m") val distanceM: Double? = null,
    @Json(name = "duration_sec") val durationSec: Double? = null,
    val maneuver: String? = null,
)

@JsonClass(generateAdapter = true)
private data class RouteCoord(
    val lat: Double = 0.0,
    val lng: Double = 0.0,
)

class OsrmClient {
    private val http =
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

    private val appAdapter =
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()
            .adapter(AppRouteResponse::class.java)

    private val userAgent = "BravaRepartidorNative/2.0 (Android)"

    fun fetchDrivingRoute(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult> {
        var lastErr: Throwable? = null
        repeat(3) { attempt ->
            if (attempt > 0) Thread.sleep((400L * attempt))
            val out = fetchViaPedidoPost(fromLng, fromLat, toLng, toLat)
            if (out.isSuccess) return out
            lastErr = out.exceptionOrNull()
        }
        return Result.failure(lastErr ?: Exception("route_failed"))
    }

    private fun fetchViaPedidoPost(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult> {
        val api = BuildConfig.API_BASE.trim()
        if (api.isBlank()) return Result.failure(Exception("api_missing"))
        val json =
            JSONObject()
                .put("action", "osrmRoute")
                .put("fromLng", fromLng)
                .put("fromLat", fromLat)
                .put("toLng", toLng)
                .put("toLat", toLat)
        return try {
            val req =
                Request.Builder()
                    .url(api)
                    .header("User-Agent", userAgent)
                    .post(json.toString().toRequestBody("application/json".toMediaType()))
                    .build()
            http.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    return Result.failure(Exception("route_http_${resp.code}"))
                }
                parseAppRoute(body)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseAppRoute(body: String): Result<RouteResult> {
        val parsed = appAdapter.fromJson(body) ?: return Result.failure(Exception("route_parse"))
        if (!parsed.ok) {
            return Result.failure(Exception(parsed.error ?: "route_api_error"))
        }
        val coords =
            parsed.coordinates.orEmpty().mapNotNull { c ->
                if (c.lat.isNaN() || c.lng.isNaN()) null else Pair(c.lat, c.lng)
            }
        if (coords.size < 2) {
            return Result.failure(Exception("route_empty_geometry"))
        }
        return Result.success(
            RouteResult(
                coordinates = coords,
                distanceM = parsed.distanceM ?: 0.0,
                durationSec = parsed.durationSec ?: 0.0,
                firstManeuver = parsed.maneuver?.trim()?.takeIf { it.isNotEmpty() }
                    ?: "Seguí la ruta resaltada",
            ),
        )
    }
}
