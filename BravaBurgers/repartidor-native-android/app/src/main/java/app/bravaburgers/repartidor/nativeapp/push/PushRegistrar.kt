package app.bravaburgers.repartidor.nativeapp.push

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import app.bravaburgers.repartidor.nativeapp.data.RepartidorRepository
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

object PushRegistrar {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun canPostNotifications(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                return false
            }
        }
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
        return nm?.areNotificationsEnabled() != false
    }

    fun registerAfterLogin(context: Context, repo: RepartidorRepository, repartidorToken: String) {
        if (!canPostNotifications(context)) return
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
        if (!canPostNotifications(context)) return
        scope.launch {
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
