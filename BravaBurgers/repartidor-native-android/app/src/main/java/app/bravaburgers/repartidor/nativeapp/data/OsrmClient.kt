package app.bravaburgers.repartidor.nativeapp.data

import app.bravaburgers.repartidor.nativeapp.BuildConfig
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
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
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .build()

    private val moshi =
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()

    private val adapter = moshi.adapter(OsrmResponse::class.java)

    private val userAgent = "BravaRepartidorNative/2.0 (Android)"

    fun fetchDrivingRoute(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult> {
        fetchViaPedidoPost(fromLng, fromLat, toLng, toLat)?.let { if (it.isSuccess) return it }
        fetchViaPedidoGet(fromLng, fromLat, toLng, toLat)?.let { if (it.isSuccess) return it }
        fetchDirectOsrm(fromLng, fromLat, toLng, toLat).let { if (it.isSuccess) return it }
        return Result.success(straightLineFallback(fromLat, fromLng, toLat, toLng))
    }

    private fun straightLineFallback(
        fromLat: Double,
        fromLng: Double,
        toLat: Double,
        toLng: Double,
    ): RouteResult {
        val distM = haversineM(fromLat, fromLng, toLat, toLng)
        return RouteResult(
            coordinates = listOf(Pair(fromLat, fromLng), Pair(toLat, toLng)),
            distanceM = distM,
            durationSec = (distM / 8.0).coerceAtLeast(60.0),
            firstManeuver = "Seguí hacia el cliente (ruta estimada en línea recta).",
            estimated = true,
        )
    }

    private fun haversineM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) *
                Math.cos(Math.toRadians(lat2)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2)
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    private fun fetchViaPedidoPost(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult>? {
        val api = BuildConfig.API_BASE.trim()
        if (api.isBlank()) return null
        val json =
            JSONObject()
                .put("action", "osrmRoute")
                .put("fromLng", fromLng)
                .put("fromLat", fromLat)
                .put("toLng", toLng)
                .put("toLat", toLat)
        return executeRouteRequest(
            Request.Builder()
                .url(api)
                .header("User-Agent", userAgent)
                .post(json.toString().toRequestBody("application/json".toMediaType()))
                .build(),
        )
    }

    private fun fetchViaPedidoGet(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult>? {
        val base = BuildConfig.ROUTE_API.trim().removeSuffix("/")
        if (base.isBlank()) return null
        val url =
            base.toHttpUrlOrNull()?.newBuilder()
                ?.addQueryParameter("action", "osrmRoute")
                ?.addQueryParameter("fromLng", fromLng.toString())
                ?.addQueryParameter("fromLat", fromLat.toString())
                ?.addQueryParameter("toLng", toLng.toString())
                ?.addQueryParameter("toLat", toLat.toString())
                ?.build()
                ?: return null
        return executeRouteRequest(
            Request.Builder()
                .url(url)
                .header("User-Agent", userAgent)
                .get()
                .build(),
        )
    }

    private fun fetchDirectOsrm(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult> {
        val base = BuildConfig.OSRM_BASE.trimEnd('/')
        val path = "$fromLng,$fromLat;$toLng,$toLat"
        val url = "$base/$path?overview=full&geometries=geojson&steps=true&language=es"
        return executeRouteRequest(
            Request.Builder()
                .url(url)
                .header("User-Agent", userAgent)
                .get()
                .build(),
        )
    }

    private fun executeRouteRequest(req: Request): Result<RouteResult> {
        return try {
            http.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    return Result.failure(Exception("osrm_http_${resp.code}"))
                }
                if (body.contains("\"ok\":false") && body.contains("\"error\"")) {
                    return Result.failure(Exception("route_api_error"))
                }
                parseRouteBody(body)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseRouteBody(body: String): Result<RouteResult> {
        val parsed = adapter.fromJson(body) ?: return Result.failure(Exception("osrm_parse"))
        if (parsed.code != "Ok" || parsed.routes.isNullOrEmpty()) {
            return Result.failure(Exception(parsed.message ?: "osrm_no_route"))
        }
        val route = parsed.routes.first()
        val coords =
            route.geometry?.coordinates?.mapNotNull { pair ->
                if (pair.size >= 2) Pair(pair[1], pair[0]) else null
            }.orEmpty()
        if (coords.size < 2) {
            return Result.failure(Exception("osrm_empty_geometry"))
        }
        val step = route.legs?.firstOrNull()?.steps?.firstOrNull()
        val maneuver =
            step?.maneuver?.instruction?.trim()?.takeIf { it.isNotEmpty() }
                ?: buildManeuverFallback(step)
        return Result.success(
            RouteResult(
                coordinates = coords,
                distanceM = route.distance ?: 0.0,
                durationSec = route.duration ?: 0.0,
                firstManeuver = maneuver,
            ),
        )
    }

    private fun buildManeuverFallback(step: OsrmStep?): String {
        if (step == null) return "Seguí la ruta resaltada"
        val street = step.name?.takeIf { it.isNotBlank() } ?: "la calle"
        return "Continuá hacia $street"
    }
}
