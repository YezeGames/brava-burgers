package app.bravaburgers.repartidor.nativeapp.push

import android.content.Context
import app.bravaburgers.repartidor.nativeapp.data.RepartidorRepository
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

object PushRegistrar {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun registerAfterLogin(context: Context, repo: RepartidorRepository, repartidorToken: String) {
        scope.launch {
            try {
                val fcm = FirebaseMessaging.getInstance().token.await()
                if (fcm.isNotBlank()) {
                    repo.savePushToken(repartidorToken, fcm)
                }
            } catch (_: Exception) {
            }
        }
    }

    fun onNewToken(context: Context, repo: RepartidorRepository, fcmToken: String) {
        scope.launch {
            val snap = repo.sessionStore.sessionFlow
            // DataStore flow needs collector — read from prefs sync path
            val sessionToken =
                SessionTokenReader.readToken(context) ?: return@launch
            if (fcmToken.isNotBlank()) {
                repo.savePushToken(sessionToken, fcmToken)
            }
        }
    }
}

/** Lectura puntual del token de sesión (FCM callback). */
private object SessionTokenReader {
    fun readToken(context: Context): String? {
        return try {
            val snap = app.bravaburgers.repartidor.nativeapp.session.SessionServicePrefs.read(context)
            snap.token.takeIf { snap.sessionOn && it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }
}
