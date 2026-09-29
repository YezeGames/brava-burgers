package app.bravaburgers.repartidor.nativeapp.data

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class ApiEnvelope(
    val ok: Boolean = false,
    val error: String? = null,
    val hint: String? = null,
    val detail: String? = null,
)

@JsonClass(generateAdapter = true)
data class LoginResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val token: String? = null,
    val login: String? = null,
    val nombre: String? = null,
    val telefono: String? = null,
)

@JsonClass(generateAdapter = true)
data class RouteStop(
    val orn: String = "",
    val cliente: String? = null,
    val telefono: String? = null,
    val direccion: String? = null,
    val localidad: String? = null,
    val piso: String? = null,
    val pago: String? = null,
    val total: Double? = null,
    val estado: String? = null,
    val parada: Int? = null,
    val items: List<OrderItem>? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    @Json(name = "llegada_at") val llegadaAt: String? = null,
)

@JsonClass(generateAdapter = true)
data class OrderItem(
    val nombre: String? = null,
    val name: String? = null,
    val cantidad: Int? = null,
    val qty: Int? = null,
    val nota: String? = null,
    val note: String? = null,
) {
    fun displayName(): String = (nombre ?: name ?: "Ítem").trim()
    fun quantity(): Int = (cantidad ?: qty ?: 1).coerceAtLeast(1)
    fun displayNote(): String? = (nota ?: note)?.trim()?.takeIf { it.isNotEmpty() }
}

@JsonClass(generateAdapter = true)
data class ListRutaResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val pedidos: List<RouteStop>? = null,
    @Json(name = "ruta_id") val rutaId: String? = null,
)

@JsonClass(generateAdapter = true)
data class SimpleActionResponse(
    val ok: Boolean = false,
    val error: String? = null,
)
