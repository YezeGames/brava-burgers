package app.bravaburgers.repartidor.nativeapp.data

import android.content.Context

class RepartidorRepository(context: Context) {
    val api = RepartidorApi()
    val appContext = context.applicationContext
    val sessionStore = SessionStore(appContext)

    /** Opcional: REPARTIDOR_APP_KEY en build local (ver README). */
    var apiKey: String? = null

    data class LoginBundle(
        val session: Session,
        val realtime: RealtimeConfigDto?,
    )

    suspend fun login(login: String, password: String): Result<LoginBundle> {
        val out = api.login(login, password, apiKey)
        if (!out.ok || out.token.isNullOrBlank()) {
            return Result.failure(Exception(out.error ?: "login_failed"))
        }
        val session =
            Session(
                token = out.token,
                login = out.login.orEmpty(),
                nombre = out.nombre?.ifBlank { out.login }.orEmpty(),
                telefono = out.telefono.orEmpty(),
            )
        sessionStore.save(session)
        return Result.success(LoginBundle(session, out.realtime))
    }

    suspend fun logout() {
        sessionStore.clear()
    }

    suspend fun fetchRoute(token: String): Result<List<RouteStop>> {
        val out = api.listRuta(token, apiKey, includeItems = false)
        if (!out.ok) return Result.failure(Exception(out.error ?: "list_failed"))
        val list = out.pedidos.orEmpty().sortedBy { it.parada ?: Int.MAX_VALUE }
        return Result.success(list)
    }

    suspend fun fetchStopDetail(token: String, orn: String): Result<RouteStop> {
        val out = api.listRuta(token, apiKey, includeItems = true, orn = orn)
        if (!out.ok) return Result.failure(Exception(out.error ?: "list_failed"))
        val stop = out.pedidos.orEmpty().firstOrNull { it.orn == orn }
            ?: return Result.failure(Exception("stop_not_found"))
        return Result.success(stop)
    }

    suspend fun iniciarRecorrido(token: String): Result<Unit> {
        val out = api.iniciarRecorrido(token, apiKey)
        return if (out.ok) Result.success(Unit) else Result.failure(Exception(out.error ?: "iniciar_failed"))
    }

    suspend fun confirmarLlegada(token: String, orn: String): Result<Unit> {
        val out = api.confirmarLlegada(token, apiKey, orn)
        return if (out.ok) Result.success(Unit) else Result.failure(Exception(out.error ?: "llegada_failed"))
    }

    suspend fun markEntregada(token: String, orn: String): Result<Unit> {
        val out = api.markEntregada(token, apiKey, orn)
        return if (out.ok) Result.success(Unit) else Result.failure(Exception(out.error ?: "entrega_failed"))
    }

    suspend fun savePushToken(repartidorToken: String, fcmToken: String) {
        try {
            api.savePushToken(repartidorToken, fcmToken, apiKey)
        } catch (_: Exception) {
        }
    }
}
