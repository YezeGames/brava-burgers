package app.bravaburgers.repartidor.nativeapp.session

import android.content.Context

/** Estado mínimo para el FGS (sin depender de DataStore en el servicio). */
object SessionServicePrefs {
    private const val PREFS = "brava_reparto_session_svc"

    private const val KEY_ON = "session_on"
    private const val KEY_TOKEN = "token"
    private const val KEY_API_KEY = "api_key"
    private const val KEY_ORN = "active_orn"

    fun setSession(context: Context, token: String, apiKey: String?, activeOrn: String = "") {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ON, true)
            .putString(KEY_TOKEN, token)
            .putString(KEY_API_KEY, apiKey.orEmpty())
            .putString(KEY_ORN, activeOrn)
            .apply()
    }

    fun setActiveOrn(context: Context, orn: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ORN, orn.trim())
            .apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
    }

    data class Snapshot(
        val sessionOn: Boolean,
        val token: String,
        val apiKey: String,
        val activeOrn: String,
    )

    fun read(context: Context): Snapshot {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return Snapshot(
            sessionOn = p.getBoolean(KEY_ON, false),
            token = p.getString(KEY_TOKEN, "").orEmpty(),
            apiKey = p.getString(KEY_API_KEY, "").orEmpty(),
            activeOrn = p.getString(KEY_ORN, "").orEmpty(),
        )
    }
}
