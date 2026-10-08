package app.bravaburgers.repartidor.nativeapp.data

import app.bravaburgers.repartidor.nativeapp.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST
import java.util.concurrent.TimeUnit

interface RepartidorApiService {
    @POST(".")
    suspend fun post(@Body body: Map<String, @JvmSuppressWildcards Any?>): Response<Map<String, Any?>>
}

class RepartidorApi {
    private val moshi =
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()

    private val client =
        OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(18, TimeUnit.SECONDS)
            .callTimeout(25, TimeUnit.SECONDS)
            .apply {
                if (BuildConfig.DEBUG) {
                    addInterceptor(
                        HttpLoggingInterceptor().apply {
                            level = HttpLoggingInterceptor.Level.BASIC
                        },
                    )
                }
            }
            .build()

    private val retrofit =
        Retrofit.Builder()
            .baseUrl(ensureSlash(BuildConfig.API_BASE))
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()

    private val service = retrofit.create(RepartidorApiService::class.java)

    private val mapAdapter = moshi.adapter(Map::class.java)
    private val loginAdapter = moshi.adapter(LoginResponse::class.java)
    private val listAdapter = moshi.adapter(ListRutaResponse::class.java)
    private val simpleAdapter = moshi.adapter(SimpleActionResponse::class.java)
    private val realtimeAdapter = moshi.adapter(RealtimeSessionResponse::class.java)
    private val signupAdapter = moshi.adapter(SignupResponse::class.java)
    private val supportAdapter = moshi.adapter(SupportStateResponse::class.java)

    suspend fun signup(
        nombre: String,
        apellido: String,
        telefono: String,
        password: String,
        apiKey: String?,
    ): SignupResponse {
        val body =
            mutableMapOf<String, Any?>(
                "action" to "repartidorSignup",
                "nombre" to nombre.trim(),
                "apellido" to apellido.trim(),
                "telefono" to telefono.trim(),
                "password" to password,
            )
        if (!apiKey.isNullOrBlank()) body["key"] = apiKey.trim()
        return parse(postRaw(body), signupAdapter)
    }

    suspend fun login(login: String, password: String, apiKey: String?): LoginResponse {
        val body = mutableMapOf<String, Any?>(
            "action" to "repartidorLogin",
            "login" to login.trim(),
            "password" to password,
        )
        if (!apiKey.isNullOrBlank()) body["key"] = apiKey.trim()
        return parse(postRaw(body), loginAdapter)
    }

    suspend fun listRuta(
        token: String,
        apiKey: String?,
        includeItems: Boolean = false,
        orn: String? = null,
    ): ListRutaResponse {
        val body = authBody(token, apiKey, "listRuta")
        if (!includeItems) body["includeItems"] = false
        if (!orn.isNullOrBlank()) body["orn"] = orn.trim()
        return parse(postRaw(body), listAdapter)
    }

    suspend fun iniciarRecorrido(token: String, apiKey: String?): SimpleActionResponse {
        val body = authBody(token, apiKey, "iniciarRecorrido")
        return parse(postRaw(body), simpleAdapter)
    }

    suspend fun confirmarLlegada(token: String, apiKey: String?, orn: String): SimpleActionResponse {
        val body = authBody(token, apiKey, "confirmarLlegada")
        body["orn"] = orn
        return parse(postRaw(body), simpleAdapter)
    }

    suspend fun markEntregada(token: String, apiKey: String?, orn: String): SimpleActionResponse {
        val body = authBody(token, apiKey, "markEntregada")
        body["orn"] = orn
        return parse(postRaw(body), simpleAdapter)
    }

    suspend fun repartidorRealtimeSession(token: String, apiKey: String?): RealtimeSessionResponse {
        val body = authBody(token, apiKey, "repartidorRealtimeSession")
        return parse(postRaw(body), realtimeAdapter)
    }

    suspend fun savePushToken(token: String, fcmToken: String, apiKey: String?): SimpleActionResponse {
        val body = authBody(token, apiKey, "savePushToken")
        body["fcm_token"] = fcmToken
        body["platform"] = "android_native"
        return parse(postRaw(body), simpleAdapter)
    }

    suspend fun reportTrack(
        token: String,
        apiKey: String?,
        orn: String,
        lat: Double,
        lng: Double,
    ): SimpleActionResponse {
        val body = authBody(token, apiKey, "reportTrack")
        body["orn"] = orn
        body["lat"] = lat
        body["lng"] = lng
        return parse(postRaw(body), simpleAdapter)
    }

    suspend fun supportGetState(token: String, apiKey: String?, orn: String): SupportStateResponse {
        val body = authBody(token, apiKey, "supportGetState")
        body["orn"] = orn
        return parse(postRaw(body), supportAdapter)
    }

    suspend fun supportOpenThread(
        token: String,
        apiKey: String?,
        orn: String,
        parada: Int?,
        topic: String,
    ): SupportStateResponse {
        val body = authBody(token, apiKey, "supportOpenThread")
        body["orn"] = orn
        body["topic"] = topic
        if (parada != null) body["parada"] = parada
        return parse(postRaw(body), supportAdapter)
    }

    suspend fun supportSendMessage(
        token: String,
        apiKey: String?,
        threadId: String,
        message: String,
    ): SupportStateResponse {
        val body = authBody(token, apiKey, "supportSendMessage")
        body["thread_id"] = threadId
        body["message"] = message
        return parse(postRaw(body), supportAdapter)
    }

    suspend fun supportCloseThread(
        token: String,
        apiKey: String?,
        threadId: String,
    ): SupportStateResponse {
        val body = authBody(token, apiKey, "supportCloseThread")
        body["thread_id"] = threadId
        return parse(postRaw(body), supportAdapter)
    }

    private fun authBody(token: String, apiKey: String?, action: String): MutableMap<String, Any?> {
        val body =
            mutableMapOf<String, Any?>(
                "action" to action,
                "repartidorToken" to token,
            )
        if (!apiKey.isNullOrBlank()) body["key"] = apiKey.trim()
        return body
    }

    /** Login/signup devuelven 401 con JSON; hay que leer errorBody (Retrofit no lo hace solo). */
    private suspend fun postRaw(body: Map<String, Any?>): Map<String, Any?> {
        val resp = service.post(body)
        resp.body()?.let { return it }
        val errJson = resp.errorBody()?.string()
        if (!errJson.isNullOrBlank()) {
            @Suppress("UNCHECKED_CAST")
            val parsed = mapAdapter.fromJson(errJson) as? Map<String, Any?>
            if (parsed != null) return parsed
        }
        return mapOf("ok" to false, "error" to "http_${resp.code()}")
    }

    private fun <T> parse(raw: Map<String, Any?>, adapter: com.squareup.moshi.JsonAdapter<T>): T {
        val json = mapAdapter.toJson(raw)
        return adapter.fromJson(json) ?: throw IllegalStateException("empty_response")
    }

    private fun ensureSlash(url: String): String = if (url.endsWith("/")) url else "$url/"
}
