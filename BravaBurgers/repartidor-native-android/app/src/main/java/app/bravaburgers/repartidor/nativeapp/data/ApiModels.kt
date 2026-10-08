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
data class SignupPendingDto(
    val nombre: String? = null,
    val apellido: String? = null,
    val telefono: String? = null,
    val login: String? = null,
)

@JsonClass(generateAdapter = true)
data class LoginResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val token: String? = null,
    val login: String? = null,
    val nombre: String? = null,
    val telefono: String? = null,
    val realtime: RealtimeConfigDto? = null,
    @Json(name = "signup_pending") val signupPending: SignupPendingDto? = null,
)

@JsonClass(generateAdapter = true)
data class RealtimeConfigDto(
    val url: String? = null,
    @Json(name = "anonKey") val anonKey: String? = null,
    @Json(name = "access_token") val accessToken: String? = null,
    @Json(name = "expires_in") val expiresIn: Int? = null,
    @Json(name = "repartidor_tel") val repartidorTel: String? = null,
)

@JsonClass(generateAdapter = true)
data class RealtimeSessionResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val realtime: RealtimeConfigDto? = null,
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
    val pedidos: List<RouteStop>? = null,
    @Json(name = "llegada_at") val llegadaAt: String? = null,
    val orn: String? = null,
)

@JsonClass(generateAdapter = true)
data class SignupRequestDto(
    val id: String? = null,
    val login: String? = null,
    val nombre: String? = null,
    val telefono: String? = null,
    val status: String? = null,
)

@JsonClass(generateAdapter = true)
data class SignupResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val request: SignupRequestDto? = null,
)

@JsonClass(generateAdapter = true)
data class SupportThreadDto(
    val id: String? = null,
    @Json(name = "repartidor_tel") val repartidorTel: String? = null,
    val orn: String? = null,
    val parada: Int? = null,
    val topic: String? = null,
    val status: String? = null,
    @Json(name = "closed_by") val closedBy: String? = null,
)

@JsonClass(generateAdapter = true)
data class SupportMessageDto(
    val id: String? = null,
    @Json(name = "thread_id") val threadId: String? = null,
    val sender: String? = null,
    val body: String? = null,
    @Json(name = "creado_at") val creadoAt: String? = null,
)

@JsonClass(generateAdapter = true)
data class SupportStateResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val thread: SupportThreadDto? = null,
    val messages: List<SupportMessageDto>? = null,
    @Json(name = "thread_id") val threadId: String? = null,
)
