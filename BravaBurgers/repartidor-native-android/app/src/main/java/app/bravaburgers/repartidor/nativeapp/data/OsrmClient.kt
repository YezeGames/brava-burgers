package app.bravaburgers.repartidor.nativeapp.data

import app.bravaburgers.repartidor.nativeapp.BuildConfig
import app.bravaburgers.repartidor.nativeapp.navigation.OsrmNavText
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class RouteResult(
    val coordinates: List<Pair<Double, Double>>,
    val distanceM: Double,
    val durationSec: Double,
    val firstManeuver: String,
    val steps: List<NavStep> = emptyList(),
    /** Etiqueta UI: Brava PC, Brava, OSRM público */
    val sourceTag: String = "OSRM",
)

/** Brava PC (túnel) primero; Brava proxy; OSRM público solo si falla lo anterior. */
class OsrmClient {
    private val http =
        OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(14, TimeUnit.SECONDS)
            .build()

    /** Túnel Brava PC: timeout corto; si falla, Brava API (misma PC vía Vercel). */
    private val directPcHttp =
        OkHttpClient.Builder()
            .connectTimeout(6, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()

    private val moshi =
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()

    private val osrmAdapter = moshi.adapter(OsrmResponseDto::class.java)
    private val appAdapter = moshi.adapter(AppRouteResponseDto::class.java)
    private val basesAdapter = moshi.adapter(OsrmBasesResponseDto::class.java)

    private val browserUa =
        "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

    private val publicBases =
        listOf(
            "https://routing.openstreetmap.de/routed-car/route/v1/driving/",
            "https://router.project-osrm.org/route/v1/driving/",
        )

    private val basesMutex = Mutex()
    private var bravaPrimaryBase: String? = null
    private var basesLoadedAtMs: Long = 0L

    /** Mismo perfil que Chrome WebView en la APK Capacitor. */
    fun fetchDrivingRoute(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult> {
        var lastErr: Throwable? = null
        bravaPrimaryBase?.let { base ->
            val direct = fetchDirectOsrm(base, fromLng, fromLat, toLng, toLat, "Brava PC")
            if (direct.isSuccess) return direct
            lastErr = direct.exceptionOrNull()
        }
        val brava = fetchViaPedidoPost(fromLng, fromLat, toLng, toLat)
        if (brava.isSuccess) return brava
        lastErr = brava.exceptionOrNull()
        for (base in publicBases) {
            val out = fetchDirectOsrm(base, fromLng, fromLat, toLng, toLat, "OSRM público")
            if (out.isSuccess) return out
            lastErr = out.exceptionOrNull()
        }
        return Result.failure(lastErr ?: Exception("route_failed"))
    }

    suspend fun prefetchBravaPrimary() {
        refreshBasesIfNeeded(force = true)
    }

    suspend fun fetchDrivingRouteFast(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult> {
        refreshBasesIfNeeded(force = true)
        bravaPrimaryBase?.let { base ->
            val direct =
                withContext(Dispatchers.IO) {
                    fetchDirectOsrm(base, fromLng, fromLat, toLng, toLat, "Brava PC", directPcHttp)
                }
            if (direct.isSuccess) return direct
        }
        val brava =
            withContext(Dispatchers.IO) {
                fetchViaPedidoPost(fromLng, fromLat, toLng, toLat)
            }
        if (brava.isSuccess) return brava

        val wavePublic =
            publicBases.map { base ->
                { fetchDirectOsrm(base, fromLng, fromLat, toLng, toLat, "OSRM público") }
            }
        return raceFirstSuccess(wavePublic, 14_000L)
            ?: Result.failure(Exception("route_timeout"))
    }

    private suspend fun refreshBasesIfNeeded(force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force && now - basesLoadedAtMs < 120_000L && bravaPrimaryBase != null) return
        if (!force && now - basesLoadedAtMs < 120_000L && bravaPrimaryBase == null && basesLoadedAtMs > 0L) {
            return
        }
        basesMutex.withLock {
            if (!force && System.currentTimeMillis() - basesLoadedAtMs < 120_000L) return
            val loaded =
                withContext(Dispatchers.IO) {
                    fetchOsrmBasesFromApi()
                }
            bravaPrimaryBase = loaded
            basesLoadedAtMs = System.currentTimeMillis()
        }
    }

    private fun fetchOsrmBasesFromApi(): String? {
        val api = BuildConfig.API_BASE.trim()
        if (api.isBlank()) return null
        val url =
            api.toHttpUrlOrNull()?.newBuilder()?.apply {
                addQueryParameter("action", "osrmBases")
            }?.build()?.toString() ?: return null
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
                if (!resp.isSuccessful) return null
                val parsed = basesAdapter.fromJson(body) ?: return null
                if (!parsed.ok) return null
                parsed.primary?.trim()?.trimEnd('/')?.plus("/")?.takeIf { it.startsWith("https://") }
            }
        } catch (_: Exception) {
            null
        }
    }

    private suspend fun raceFirstSuccess(
        attempts: List<() -> Result<RouteResult>>,
        timeoutMs: Long,
    ): Result<RouteResult>? {
        if (attempts.isEmpty()) return null
        return withTimeoutOrNull(timeoutMs) {
            coroutineScope {
                val gate = CompletableDeferred<Result<RouteResult>>()
                val failures = AtomicInteger(0)
                attempts.forEach { block ->
                    launch(Dispatchers.IO) {
                        val out = block()
                        if (out.isSuccess) {
                            if (!gate.isCompleted) gate.complete(out)
                        } else if (failures.incrementAndGet() == attempts.size && !gate.isCompleted) {
                            gate.complete(out)
                        }
                    }
                }
                gate.await().takeIf { it.isSuccess }
            }
        }
    }

    private fun fetchDirectOsrm(
        base: String,
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
        sourceTag: String,
        client: OkHttpClient = http,
    ): Result<RouteResult> {
        val path = "$fromLng,$fromLat;$toLng,$toLat"
        val url = "${base.trimEnd('/')}/$path?steps=true&geometries=geojson&overview=full"
        return executeGet(url, sourceTag, client)
    }

    private fun executeGet(url: String, sourceTag: String, client: OkHttpClient = http): Result<RouteResult> {
        return try {
            val req =
                Request.Builder()
                    .url(url)
                    .header("User-Agent", browserUa)
                    .header("Accept", "application/json")
                    .get()
                    .build()
            client.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    return Result.failure(Exception("osrm_http_${resp.code}"))
                }
                parseOsrmJson(body, sourceTag)
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
                parseAppRoute(body).recoverCatching { parseOsrmJson(body, "Brava").getOrThrow() }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseOsrmJson(body: String, sourceTag: String): Result<RouteResult> {
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
        val osrmSteps = route.legs?.firstOrNull()?.steps.orEmpty()
        val step = osrmSteps.firstOrNull()
        val navSteps = buildNavSteps(osrmSteps, coords)
        return Result.success(
            RouteResult(
                coordinates = coords,
                distanceM = route.distance ?: 0.0,
                durationSec = route.duration ?: 0.0,
                firstManeuver = OsrmNavText.maneuverText(step),
                steps = navSteps,
                sourceTag = sourceTag,
            ),
        )
    }

    private fun buildNavSteps(osrmSteps: List<OsrmStepDto>, routeCoords: List<Pair<Double, Double>>): List<NavStep> {
        if (osrmSteps.isEmpty()) return emptyList()
        val out = mutableListOf<NavStep>()
        for (s in osrmSteps) {
            val loc = s.maneuver?.location
            val latLng =
                if (loc != null && loc.size >= 2) {
                    Pair(loc[1], loc[0])
                } else {
                    null
                }
            if (latLng != null) {
                out.add(NavStep(lat = latLng.first, lng = latLng.second, dto = s))
            }
        }
        if (out.isNotEmpty()) return out
        if (routeCoords.size >= 2) {
            val first = osrmSteps.first()
            val p = routeCoords.first()
            return listOf(NavStep(lat = p.first, lng = p.second, dto = first))
        }
        return emptyList()
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
                steps = emptyList(),
                sourceTag = apiRouteSourceLabel(parsed.routeSource),
            ),
        )
    }

    private fun apiRouteSourceLabel(routeSource: String?): String {
        return when (routeSource?.trim()?.lowercase()) {
            "brava_pc" -> "Brava PC"
            "osrm_public" -> "OSRM público"
            "ors" -> "ORS"
            else -> "Brava"
        }
    }
}
