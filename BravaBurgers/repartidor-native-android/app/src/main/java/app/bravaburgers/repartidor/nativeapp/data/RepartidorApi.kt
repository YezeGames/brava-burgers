package app.bravaburgers.repartidor.nativeapp.data

import app.bravaburgers.repartidor.nativeapp.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST
import java.util.concurrent.TimeUnit

interface RepartidorApiService {
    @POST(".")
    suspend fun post(@Body body: Map<String, @JvmSuppressWildcards Any?>): Map<String, Any?>
}

class RepartidorApi {
    private val moshi =
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()

    private val client =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
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

    private val loginAdapter = moshi.adapter(LoginResponse::class.java)
    private val listAdapter = moshi.adapter(ListRutaResponse::class.java)
    private val simpleAdapter = moshi.adapter(SimpleActionResponse::class.java)
    private val realtimeAdapter = moshi.adapter(RealtimeSessionResponse::class.java)

    suspend fun login(login: String, password: String, apiKey: String?): LoginResponse {
        val body = mutableMapOf<String, Any?>(
            "action" to "repartidorLogin",
            "login" to login.trim(),
            "password" to password,
        )
        if (!apiKey.isNullOrBlank()) body["key"] = apiKey.trim()
        return parse(service.post(body), loginAdapter)
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
        return parse(service.post(body), listAdapter)
    }

    suspend fun iniciarRecorrido(token: String, apiKey: String?): SimpleActionResponse {
        val body = authBody(token, apiKey, "iniciarRecorrido")
        return parse(service.post(body), simpleAdapter)
    }

    suspend fun confirmarLlegada(token: String, apiKey: String?, orn: String): SimpleActionResponse {
        val body = authBody(token, apiKey, "confirmarLlegada")
        body["orn"] = orn
        return parse(service.post(body), simpleAdapter)
    }

    suspend fun markEntregada(token: String, apiKey: String?, orn: String): SimpleActionResponse {
        val body = authBody(token, apiKey, "markEntregada")
        body["orn"] = orn
        return parse(service.post(body), simpleAdapter)
    }

    suspend fun repartidorRealtimeSession(token: String, apiKey: String?): RealtimeSessionResponse {
        val body = authBody(token, apiKey, "repartidorRealtimeSession")
        return parse(service.post(body), realtimeAdapter)
    }

    suspend fun savePushToken(token: String, fcmToken: String, apiKey: String?): SimpleActionResponse {
        val body = authBody(token, apiKey, "savePushToken")
        body["fcm_token"] = fcmToken
        body["platform"] = "android"
        return parse(service.post(body), simpleAdapter)
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
        return parse(service.post(body), simpleAdapter)
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

    private fun <T> parse(raw: Map<String, Any?>, adapter: com.squareup.moshi.JsonAdapter<T>): T {
        val json = moshi.adapter(Map::class.java).toJson(raw)
        return adapter.fromJson(json) ?: throw IllegalStateException("empty_response")
    }

    private fun ensureSlash(url: String): String = if (url.endsWith("/")) url else "$url/"
}
