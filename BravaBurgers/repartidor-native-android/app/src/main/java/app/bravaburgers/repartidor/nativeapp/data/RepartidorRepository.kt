package app.bravaburgers.repartidor.nativeapp.data

import android.content.Context

class RepartidorRepository(context: Context) {
    private val api = RepartidorApi()
    val appContext = context.applicationContext
    val sessionStore = SessionStore(appContext)

    /** Opcional: REPARTIDOR_APP_KEY en build local (ver README). */
    var apiKey: String? = null

    suspend fun login(login: String, password: String): Result<Session> {
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
        return Result.success(session)
    }

    suspend fun logout() {
        sessionStore.clear()
    }

    suspend fun fetchRoute(token: String): Result<List<RouteStop>> {
        val out = api.listRuta(token, apiKey)
        if (!out.ok) return Result.failure(Exception(out.error ?: "list_failed"))
        val list = out.pedidos.orEmpty().sortedBy { it.parada ?: Int.MAX_VALUE }
        return Result.success(list)
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
}
