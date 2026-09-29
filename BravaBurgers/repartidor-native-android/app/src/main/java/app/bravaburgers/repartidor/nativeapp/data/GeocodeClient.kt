package app.bravaburgers.repartidor.nativeapp.data

import app.bravaburgers.repartidor.nativeapp.BuildConfig
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

fun RouteStop.deliveryGeocodeQuery(): String {
    val parts = mutableListOf<String>()
    direccion?.trim()?.takeIf { it.isNotEmpty() }?.let { parts.add(it) }
    piso?.trim()?.takeIf { it.isNotEmpty() }?.let { parts.add("Piso $it") }
    localidad?.trim()?.takeIf { it.isNotEmpty() }?.let { parts.add(it) }
    parts.add("Provincia de Buenos Aires")
    parts.add("Argentina")
    return parts.joinToString(", ")
}

@JsonClass(generateAdapter = true)
private data class GeocodeResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
)

class GeocodeClient {
    private val http =
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .build()

    private val adapter =
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()
            .adapter(GeocodeResponse::class.java)

    private val siteBase: String =
        BuildConfig.API_BASE
            .removeSuffix("/api/pedido")
            .removeSuffix("/")

    suspend fun geocodeStop(stop: RouteStop): Result<Pair<Double, Double>> {
        val q = stop.deliveryGeocodeQuery()
        if (q.length < 8) {
            return Result.failure(Exception("Dirección incompleta para ubicar en el mapa."))
        }
        val loc = stop.localidad?.trim().orEmpty()
        val urlBuilder =
            "$siteBase/api/address-suggest".toHttpUrlOrNull()?.newBuilder()
                ?: return Result.failure(Exception("URL de geocodificador inválida."))
        urlBuilder.addQueryParameter("mode", "geocode")
        urlBuilder.addQueryParameter("q", q)
        if (loc.isNotEmpty()) {
            urlBuilder.addQueryParameter("loc", loc)
        }
        val request = Request.Builder().url(urlBuilder.build()).get().build()
        return try {
            http.newCall(request).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                val data = adapter.fromJson(body) ?: GeocodeResponse()
                if (!resp.isSuccessful || !data.ok) {
                    val msg =
                        when (data.error) {
                            "geocoder_not_configured" ->
                                "Geocodificador no configurado en el servidor."
                            "not_found" -> "No ubicamos «${stop.direccion.orEmpty()}» en el mapa."
                            "missing_query" -> "Dirección incompleta."
                            else -> data.error ?: "No se pudo geocodificar la dirección."
                        }
                    Result.failure(Exception(msg))
                } else {
                    val lat = data.lat
                    val lng = data.lng
                    if (lat == null || lng == null) {
                        Result.failure(Exception("Respuesta de mapa sin coordenadas."))
                    } else {
                        Result.success(Pair(lat, lng))
                    }
                }
            }
        } catch (e: Exception) {
            Result.failure(Exception(e.message ?: "Error de red al ubicar la dirección."))
        }
    }
}
