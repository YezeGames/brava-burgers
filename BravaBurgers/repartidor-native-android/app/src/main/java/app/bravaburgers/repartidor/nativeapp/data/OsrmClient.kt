package app.bravaburgers.repartidor.nativeapp.data

import app.bravaburgers.repartidor.nativeapp.BuildConfig
import app.bravaburgers.repartidor.nativeapp.navigation.OsrmNavText
import app.bravaburgers.repartidor.nativeapp.navigation.core.BravaGeo
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
import org.json.JSONArray
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

/**
 * Rutas A→B para **cada parada** (1, 2, 3…), recálculo off-route y fallback API.
 * Siempre criterio **menor distancia** ([valhallaShortestCostingOptions] / OSRM alternativas).
 */
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
    private var bravaValhallaRouteUrl: String? = null
    private var bravaValhallaServiceBase: String? = null
    private var basesLoadedAtMs: Long = 0L

    fun hasValhallaService(): Boolean = !bravaValhallaServiceBase.isNullOrBlank()

    /** `/locate` directo o proxy Vercel `valhallaMatch` (sin trace_route en vivo). */
    fun hasValhallaMapMatch(): Boolean =
        hasValhallaService() || BuildConfig.API_BASE.trim().isNotBlank()

    /** Mismo perfil que Chrome WebView en la APK Capacitor. */
    fun fetchDrivingRoute(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
    ): Result<RouteResult> {
        var lastErr: Throwable? = null
        bravaValhallaRouteUrl?.let { url ->
            val v = fetchDirectValhalla(url, fromLng, fromLat, toLng, toLat, "Valhalla PC")
            if (v.isSuccess) return v
            lastErr = v.exceptionOrNull()
        }
        bravaPrimaryBase?.let { base ->
            if (!base.contains("/route", ignoreCase = true) || base.contains("driving")) {
                val direct = fetchDirectOsrm(base, fromLng, fromLat, toLng, toLat, "Brava PC")
                if (direct.isSuccess) return direct
                lastErr = direct.exceptionOrNull()
            }
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

    suspend fun ensureBasesLoaded() {
        refreshBasesIfNeeded(force = true)
    }

    suspend fun prefetchBravaPrimary() {
        refreshBasesIfNeeded(force = false)
        val base = bravaPrimaryBase ?: return
        withContext(Dispatchers.IO) {
            runCatching {
                fetchDirectOsrm(
                    base,
                    -58.482,
                    -34.505,
                    -58.478,
                    -34.502,
                    "Brava PC",
                    directPcHttp,
                    overview = "false",
                )
            }
        }
    }

    suspend fun fetchDrivingRouteFast(
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
        headingDeg: Float? = null,
    ): Result<RouteResult> {
        if (bravaPrimaryBase.isNullOrBlank() && bravaValhallaRouteUrl.isNullOrBlank()) {
            refreshBasesIfNeeded(force = true)
        }
        val attempts = mutableListOf<() -> Result<RouteResult>>()
        bravaValhallaRouteUrl?.let { url ->
            attempts.add {
                fetchDirectValhalla(
                    url,
                    fromLng,
                    fromLat,
                    toLng,
                    toLat,
                    "Valhalla PC",
                    directPcHttp,
                    headingDeg,
                )
            }
        }
        bravaPrimaryBase?.let { base ->
            if (base.contains("driving", ignoreCase = true)) {
                attempts.add {
                    fetchDirectOsrm(base, fromLng, fromLat, toLng, toLat, "Brava PC", directPcHttp)
                }
            }
        }
        attempts.add { fetchViaPedidoPost(fromLng, fromLat, toLng, toLat, headingDeg) }
        if (bravaValhallaRouteUrl.isNullOrBlank()) {
            for (base in publicBases) {
                attempts.add { fetchDirectOsrm(base, fromLng, fromLat, toLng, toLat, "OSRM público") }
            }
        }
        return raceFirstSuccess(attempts, 16_000L)
            ?: Result.failure(Exception("route_timeout"))
    }

    private suspend fun refreshBasesIfNeeded(force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force && now - basesLoadedAtMs < 600_000L && (bravaPrimaryBase != null || bravaValhallaRouteUrl != null)) {
            return
        }
        if (
            !force &&
            now - basesLoadedAtMs < 60_000L &&
            bravaPrimaryBase == null &&
            bravaValhallaRouteUrl == null &&
            basesLoadedAtMs > 0L
        ) {
            return
        }
        basesMutex.withLock {
            if (
                !force &&
                System.currentTimeMillis() - basesLoadedAtMs < 600_000L &&
                (bravaPrimaryBase != null || bravaValhallaRouteUrl != null)
            ) {
                return
            }
            val loaded =
                withContext(Dispatchers.IO) {
                    fetchOsrmBasesFromApi()
                }
            bravaPrimaryBase = loaded.osrm
            bravaValhallaRouteUrl = loaded.valhalla
            bravaValhallaServiceBase =
                loaded.valhalla
                    ?.trim()
                    ?.replace(Regex("/route/?$", RegexOption.IGNORE_CASE), "")
                    ?.trimEnd('/')
                    ?.takeIf { it.startsWith("https://") }
            basesLoadedAtMs = System.currentTimeMillis()
        }
    }

    /** Puck en vivo: solo [/locate] — no trace (evita saltos de maniobra). */
    fun valhallaLocateOnly(lat: Double, lng: Double): Pair<Double, Double>? {
        val service = bravaValhallaServiceBase
        if (!service.isNullOrBlank()) {
            valhallaLocate(service, lat, lng)?.let { return it }
        }
        return valhallaLocateViaApi(lat, lng)
    }

    /** Legacy / herramientas; no usar en navegación en vivo. */
    fun valhallaMapMatch(
        trail: List<Pair<Double, Double>>,
        lat: Double,
        lng: Double,
    ): Pair<Double, Double>? {
        val service = bravaValhallaServiceBase
        if (!service.isNullOrBlank()) {
            if (trail.size >= 2) {
                val merged = trail + Pair(lat, lng)
                valhallaTraceSnap(service, merged)?.let { return it }
            }
            valhallaLocate(service, lat, lng)?.let { return it }
        }
        return valhallaMapMatchViaApi(trail, lat, lng)
    }

    private fun valhallaLocate(base: String, lat: Double, lng: Double): Pair<Double, Double>? {
        val url = "${base.trimEnd('/')}/locate"
        val json =
            JSONObject()
                .put("locations", JSONArray().put(JSONObject().put("lat", lat).put("lon", lng)))
                .put("costing", "auto")
        return postValhallaJson(url, json)?.let { ValhallaMatch.parseLocate(it) }
    }

    private fun valhallaTraceSnap(
        base: String,
        points: List<Pair<Double, Double>>,
    ): Pair<Double, Double>? {
        if (points.size < 2) return null
        val url = "${base.trimEnd('/')}/trace_route"
        val shape = JSONArray()
        for (p in points) {
            shape.put(JSONObject().put("lat", p.first).put("lon", p.second))
        }
        val json =
            JSONObject()
                .put("shape", shape)
                .put("costing", "auto")
                .put("shape_match", "map_snap")
                .put("shape_format", "polyline6")
                .put("directions_options", JSONObject().put("language", "es-ES"))
        return postValhallaJson(url, json, client = directPcHttp)?.let { ValhallaMatch.parseTraceLastPoint(it) }
    }

    private fun valhallaLocateViaApi(lat: Double, lng: Double): Pair<Double, Double>? {
        val api = BuildConfig.API_BASE.trim()
        if (api.isBlank()) return null
        val json =
            JSONObject()
                .put("action", "valhallaMatch")
                .put("lat", lat)
                .put("lng", lng)
                .put("mode", "locate")
        return postValhallaMatchApi(api, json)
    }

    private fun valhallaMapMatchViaApi(
        trail: List<Pair<Double, Double>>,
        lat: Double,
        lng: Double,
    ): Pair<Double, Double>? {
        val api = BuildConfig.API_BASE.trim()
        if (api.isBlank()) return null
        val json =
            JSONObject()
                .put("action", "valhallaMatch")
                .put("lat", lat)
                .put("lng", lng)
        if (trail.isNotEmpty()) {
            val arr = JSONArray()
            for (p in trail) {
                arr.put(JSONObject().put("lat", p.first).put("lng", p.second))
            }
            json.put("trail", arr)
        }
        return postValhallaMatchApi(api, json)
    }

    private fun postValhallaMatchApi(api: String, json: JSONObject): Pair<Double, Double>? {
        return try {
            val req =
                Request.Builder()
                    .url(api)
                    .header("User-Agent", browserUa)
                    .post(json.toString().toRequestBody("application/json".toMediaType()))
                    .build()
            http.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) return null
                val o = JSONObject(body)
                if (!o.optBoolean("ok", false)) return null
                val mLat = o.optDouble("lat", Double.NaN)
                val mLng = o.optDouble("lng", Double.NaN)
                if (mLat.isNaN() || mLng.isNaN()) null else Pair(mLat, mLng)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun postValhallaJson(
        url: String,
        json: JSONObject,
        client: OkHttpClient = http,
    ): String? {
        return try {
            val req =
                Request.Builder()
                    .url(url)
                    .header("User-Agent", browserUa)
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .post(json.toString().toRequestBody("application/json".toMediaType()))
                    .build()
            client.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) null else body
            }
        } catch (_: Exception) {
            null
        }
    }

    private data class RouteBases(val osrm: String?, val valhalla: String?)

    private fun fetchOsrmBasesFromApi(): RouteBases {
        val api = BuildConfig.API_BASE.trim()
        if (api.isBlank()) return RouteBases(null, null)
        val url =
            api.toHttpUrlOrNull()?.newBuilder()?.apply {
                addQueryParameter("action", "osrmBases")
            }?.build()?.toString() ?: return RouteBases(null, null)
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
                if (!resp.isSuccessful) return RouteBases(null, null)
                val parsed = basesAdapter.fromJson(body) ?: return RouteBases(null, null)
                if (!parsed.ok) return RouteBases(null, null)
                val osrm =
                    parsed.osrm?.trim()?.trimEnd('/')?.plus("/")
                        ?: parsed.primary?.trim()?.trimEnd('/')?.plus("/")
                val osrmBase = osrm?.takeIf { it.contains("driving", ignoreCase = true) }
                val valhalla =
                    parsed.valhalla?.trim()?.trimEnd('/')
                        ?: parsed.primary?.trim()?.trimEnd('/').takeIf {
                            it != null && it.contains("/route", ignoreCase = true) &&
                                !it.contains("driving", ignoreCase = true)
                        }
                RouteBases(
                    osrm = osrmBase,
                    valhalla = valhalla?.takeIf { it.startsWith("https://") },
                )
            }
        } catch (_: Exception) {
            RouteBases(null, null)
        }
    }

    private fun fetchDirectValhalla(
        routeUrl: String,
        fromLng: Double,
        fromLat: Double,
        toLng: Double,
        toLat: Double,
        sourceTag: String,
        client: OkHttpClient = http,
        headingDeg: Float? = null,
    ): Result<RouteResult> {
        val url = routeUrl.trim().trimEnd('/')
        val origin =
            JSONObject().put("lon", fromLng).put("lat", fromLat).put("type", "break")
        headingDeg?.takeIf { it.isFinite() }?.let { h ->
            origin.put("heading", BravaGeo.wrapDeg(h.toDouble()).toInt())
        }
        val json =
            JSONObject()
                .put(
                    "locations",
                    JSONArray()
                        .put(origin)
                        .put(JSONObject().put("lon", toLng).put("lat", toLat).put("type", "break")),
                )
                .put("costing", "auto")
                .put("units", "kilometers")
                .put("language", "es-ES")
                .put(
                    "directions_options",
                    JSONObject().put("units", "kilometers").put("language", "es-ES"),
                )
                .put("costing_options", valhallaShortestCostingOptions())
                .put("shape_format", "polyline6")
        return try {
            val req =
                Request.Builder()
                    .url(url)
                    .header("User-Agent", browserUa)
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .post(json.toString().toRequestBody("application/json".toMediaType()))
                    .build()
            client.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    return Result.failure(Exception("valhalla_http_${resp.code}"))
                }
                ValhallaRouteParser.parse(body, sourceTag)
            }
        } catch (e: Exception) {
            Result.failure(e)
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
        overview: String = "full",
    ): Result<RouteResult> {
        val path = "$fromLng,$fromLat;$toLng,$toLat"
        val url =
            "${base.trimEnd('/')}/$path?steps=true&geometries=geojson&overview=$overview&alternatives=2"
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
        headingDeg: Float? = null,
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
        headingDeg?.takeIf { it.isFinite() }?.let { json.put("fromHeading", it.toDouble()) }
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
        val route =
            parsed.routes.minByOrNull { it.distance ?: Double.MAX_VALUE }
                ?: parsed.routes.first()
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
        val osrmSteps = parsed.steps.orEmpty()
        val navSteps = buildNavSteps(osrmSteps, coords)
        val step = osrmSteps.firstOrNull()
        return Result.success(
            RouteResult(
                coordinates = coords,
                distanceM = parsed.distanceM ?: 0.0,
                durationSec = parsed.durationSec ?: 0.0,
                firstManeuver =
                    parsed.maneuver?.trim()?.takeIf { it.isNotEmpty() }
                        ?: OsrmNavText.maneuverText(step),
                steps = navSteps,
                sourceTag = apiRouteSourceLabel(parsed.routeSource),
            ),
        )
    }

    private fun apiRouteSourceLabel(routeSource: String?): String {
        return when (routeSource?.trim()?.lowercase()) {
            "brava_pc" -> "Brava PC"
            "valhalla" -> "Valhalla"
            "osrm_public" -> "OSRM público"
            "ors" -> "ORS"
            else -> "Brava"
        }
    }

    companion object {
        /** Mismo criterio que `lib/bravaRoutePreferences.js` en Vercel. */
        fun valhallaShortestCostingOptions(): JSONObject =
            JSONObject()
                .put(
                    "auto",
                    JSONObject()
                        .put("shortest", true)
                        .put("disable_hierarchy_pruning", true),
                )
    }
}
