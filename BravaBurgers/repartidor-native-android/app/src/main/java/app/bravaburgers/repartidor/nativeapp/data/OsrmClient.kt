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
)

/** Igual que Capacitor/WebView: OSRM directo desde el teléfono; servidor Brava como respaldo. */
class OsrmClient {
    private val http =
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

    private val moshi =
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()

    private val osrmAdapter = moshi.adapter(OsrmResponse::class.java)
    private val appAdapter = moshi.adapter(AppRouteResponse::class.java)

    /** Mismo perfil que Chrome WebView en la APK Capacitor. */
    private val browserUa =
        "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

    private val directBases =
        listOf(
            "https://router.project-osrm.org/route/v1/driving/",
            "https://routing.openstreetmap.de/routed-car/route/v1/driving/",
        )

    fun fetchDrivingRoute(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult> {
        var lastErr: Throwable? = null
        for (base in directBases) {
            repeat(2) { attempt ->
                if (attempt > 0) Thread.sleep(350L)
                val out = fetchDirectOsrm(base, fromLng, fromLat, toLng, toLat)
                if (out.isSuccess) return out
                lastErr = out.exceptionOrNull()
            }
        }
        repeat(2) { attempt ->
            if (attempt > 0) Thread.sleep(400L)
            val out = fetchViaPedidoPost(fromLng, fromLat, toLng, toLat)
            if (out.isSuccess) return out
            lastErr = out.exceptionOrNull()
        }
        return Result.failure(lastErr ?: Exception("route_failed"))
    }

    /** URL idéntica a repartidor/index.html fetchRouteOsrm */
    private fun fetchDirectOsrm(
        base: String,
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult> {
        val path = "$fromLng,$fromLat;$toLng,$toLat"
        val url = "${base.trimEnd('/')}/$path?steps=true&geometries=geojson&overview=full"
        return executeGet(url)
    }

    private fun executeGet(url: String): Result<RouteResult> {
        return try {
            val req =
                Request.Builder()
                    .url(url)
                    .header("User-Agent", browserUa)
                    .header("Accept", "application/json")
                    .get()
                    .build()
            http.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    return Result.failure(Exception("osrm_http_${resp.code}"))
                }
                parseOsrmJson(body)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
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
                    .header("User-Agent", browserUa)
                    .post(json.toString().toRequestBody("application/json".toMediaType()))
                    .build()
            http.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    return Result.failure(Exception("route_http_${resp.code}"))
                }
                parseAppRoute(body).recoverCatching { parseOsrmJson(body).getOrThrow() }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseOsrmJson(body: String): Result<RouteResult> {
        val parsed = osrmAdapter.fromJson(body) ?: return Result.failure(Exception("osrm_parse"))
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
        return Result.success(
            RouteResult(
                coordinates = coords,
                distanceM = route.distance ?: 0.0,
                durationSec = route.duration ?: 0.0,
                firstManeuver = maneuverText(step),
            ),
        )
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

    private fun maneuverText(step: OsrmStep?): String {
        if (step == null || step.maneuver == null) return "Seguí por la ruta resaltada"
        val m = step.maneuver
        val street = (m.name ?: step.name)?.trim().orEmpty()
        val t = m.type.orEmpty()
        val mod = m.modifier.orEmpty()
        return when {
            t == "arrive" -> "Llegaste al destino"
            t == "depart" -> "Salí hacia ${street.ifEmpty { "la ruta" }}"
            mod == "left" -> "Girá a la izquierda${if (street.isNotEmpty()) " en $street" else ""}"
            mod == "right" -> "Girá a la derecha${if (street.isNotEmpty()) " en $street" else ""}"
            mod == "slight left" -> "Mantenete a la izquierda"
            mod == "slight right" -> "Mantenete a la derecha"
            t == "roundabout" -> "Tomá la rotonda"
            t == "continue" -> "Continuá${if (street.isNotEmpty()) " por $street" else ""}"
            !m.instruction.isNullOrBlank() -> m.instruction!!.trim()
            else -> "Seguí la ruta resaltada"
        }
    }
}

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
    val name: String? = null,
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
