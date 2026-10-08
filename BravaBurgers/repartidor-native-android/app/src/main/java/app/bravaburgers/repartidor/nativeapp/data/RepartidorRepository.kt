package app.bravaburgers.repartidor.nativeapp.data

import android.content.Context

class SignupPendingLoginException(
    val nombre: String,
    val apellido: String,
    val telefono: String,
    val login: String,
) : Exception("signup_pending")

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
        val out =
            try {
                api.login(login, password, apiKey)
            } catch (e: Exception) {
                return Result.failure(e)
            }
        if (out.error == "signup_pending") {
            val p = out.signupPending
            return Result.failure(
                SignupPendingLoginException(
                    nombre = p?.nombre.orEmpty(),
                    apellido = p?.apellido.orEmpty(),
                    telefono = p?.telefono.orEmpty(),
                    login = p?.login.orEmpty().ifBlank { login.trim() },
                ),
            )
        }
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

    suspend fun iniciarRecorrido(token: String): Result<List<RouteStop>?> {
        val out = api.iniciarRecorrido(token, apiKey)
        if (!out.ok) return Result.failure(Exception(out.error ?: "iniciar_failed"))
        val list = out.pedidos?.sortedBy { it.parada ?: Int.MAX_VALUE }
        return Result.success(list)
    }

    suspend fun confirmarLlegada(token: String, orn: String): Result<String?> {
        val out = api.confirmarLlegada(token, apiKey, orn)
        if (!out.ok) return Result.failure(Exception(out.error ?: "llegada_failed"))
        return Result.success(out.llegadaAt)
    }

    suspend fun markEntregada(token: String, orn: String): Result<List<RouteStop>?> {
        val out = api.markEntregada(token, apiKey, orn)
        if (!out.ok) return Result.failure(Exception(out.error ?: "entrega_failed"))
        val list = out.pedidos?.sortedBy { it.parada ?: Int.MAX_VALUE }
        return Result.success(list)
    }

    suspend fun savePushToken(repartidorToken: String, fcmToken: String) {
        try {
            api.savePushToken(repartidorToken, fcmToken, apiKey)
        } catch (_: Exception) {
        }
    }

    suspend fun signup(
        nombre: String,
        apellido: String,
        telefono: String,
        password: String,
    ): Result<Unit> {
        val out = api.signup(nombre, apellido, telefono, password, apiKey)
        if (!out.ok) return Result.failure(Exception(out.error ?: "signup_failed"))
        return Result.success(Unit)
    }

    suspend fun supportGetState(token: String, orn: String): Result<SupportStateResponse> {
        val out = api.supportGetState(token, apiKey, orn)
        if (!out.ok) return Result.failure(Exception(out.error ?: "support_failed"))
        return Result.success(out)
    }

    suspend fun supportOpenThread(
        token: String,
        orn: String,
        parada: Int?,
        topic: String,
    ): Result<SupportStateResponse> {
        val out = api.supportOpenThread(token, apiKey, orn, parada, topic)
        if (!out.ok) return Result.failure(Exception(out.error ?: "support_open_failed"))
        return Result.success(out)
    }

    suspend fun supportSendMessage(
        token: String,
        threadId: String,
        message: String,
    ): Result<SupportStateResponse> {
        val out = api.supportSendMessage(token, apiKey, threadId, message)
        if (!out.ok) return Result.failure(Exception(out.error ?: "support_send_failed"))
        return Result.success(out)
    }

    suspend fun supportCloseThread(token: String, threadId: String): Result<SupportStateResponse> {
        val out = api.supportCloseThread(token, apiKey, threadId)
        if (!out.ok) return Result.failure(Exception(out.error ?: "support_close_failed"))
        return Result.success(out)
    }
}
