package app.bravaburgers.repartidor.nativeapp.realtime

import app.bravaburgers.repartidor.nativeapp.data.RealtimeConfigDto
import app.bravaburgers.repartidor.nativeapp.data.RepartidorApi
import app.bravaburgers.repartidor.nativeapp.session.RouteEvents
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach

/** WebSocket Supabase Realtime — eventos de ruta (sin poll). */
class RepartidorRealtimeCoordinator(
    private val scope: CoroutineScope,
    private val api: RepartidorApi,
    private val apiKey: String?,
) {
    private var supabase: io.github.jan.supabase.SupabaseClient? = null
    private var refreshJob: Job? = null
    private var repartidorToken: String? = null

    fun start(repartidorToken: String, initial: RealtimeConfigDto? = null) {
        this.repartidorToken = repartidorToken
        scope.launch {
            connect(initial ?: fetchConfig(repartidorToken) ?: return@launch)
            scheduleTokenRefresh(repartidorToken)
        }
    }

    fun stop() {
        refreshJob?.cancel()
        refreshJob = null
        repartidorToken = null
        supabase = null
    }

    private suspend fun fetchConfig(token: String): RealtimeConfigDto? {
        return try {
            val out = api.repartidorRealtimeSession(token, apiKey)
            if (out.ok) out.realtime else null
        } catch (_: Exception) {
            null
        }
    }

    private suspend fun connect(cfg: RealtimeConfigDto) {
        val url = cfg.url?.trim().orEmpty()
        val anon = cfg.anonKey?.trim().orEmpty()
        val access = cfg.accessToken?.trim().orEmpty()
        val tel = cfg.repartidorTel?.trim().orEmpty()
        if (url.isEmpty() || anon.isEmpty() || access.isEmpty() || tel.isEmpty()) return

        val client =
            createSupabaseClient(supabaseUrl = url, supabaseKey = anon) {
                install(Auth)
                install(Realtime)
            }
        client.auth.importAuthToken(accessToken = access, refreshToken = "")
        supabase = client

        val channel = client.channel("brava-repartidor-$tel")
        channel
            .postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
                table = "repartidor_route_events"
                filter = "repartidor_tel=eq.$tel"
            }.onEach {
                RouteEvents.requestRefresh("realtime")
            }.launchIn(scope)
        channel.subscribe()
    }

    private fun scheduleTokenRefresh(repartidorToken: String) {
        refreshJob?.cancel()
        refreshJob =
            scope.launch {
                while (isActive) {
                    delay(45 * 60 * 1000L)
                    val cfg = fetchConfig(repartidorToken) ?: continue
                    try {
                        supabase?.auth?.importAuthToken(
                            accessToken = cfg.accessToken.orEmpty(),
                            refreshToken = "",
                        )
                    } catch (_: Exception) {
                        connect(cfg)
                    }
                }
            }
    }
}
