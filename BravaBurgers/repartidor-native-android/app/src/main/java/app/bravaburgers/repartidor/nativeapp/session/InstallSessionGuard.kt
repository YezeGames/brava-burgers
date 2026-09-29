package app.bravaburgers.repartidor.nativeapp.session

import android.content.Context
import app.bravaburgers.repartidor.nativeapp.BuildConfig
import app.bravaburgers.repartidor.nativeapp.data.SessionStore
import kotlinx.coroutines.runBlocking

/**
 * Al instalar una APK nueva (versionCode distinto), borra sesión guardada.
 * Android conserva datos en actualizaciones; el repartidor debe volver a entrar.
 */
object InstallSessionGuard {
    private const val PREFS = "brava_repartidor_install"
    private const val KEY_VERSION_CODE = "last_version_code"

    fun clearSessionIfNewBuild(context: Context) {
        val app = context.applicationContext
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val stored = prefs.getInt(KEY_VERSION_CODE, -1)
        val current = BuildConfig.VERSION_CODE
        if (stored == current) return

        runBlocking {
            SessionStore(app).clear()
        }
        SessionServicePrefs.clear(app)
        prefs.edit().putInt(KEY_VERSION_CODE, current).apply()
    }
}
