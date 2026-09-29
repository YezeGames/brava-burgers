package app.bravaburgers.repartidor.nativeapp.push

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import app.bravaburgers.repartidor.nativeapp.BravaRepartidorApp
import app.bravaburgers.repartidor.nativeapp.MainActivity
import app.bravaburgers.repartidor.nativeapp.session.AppForeground
import app.bravaburgers.repartidor.nativeapp.session.RouteEvents
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class BravaFcmService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val app = application as? BravaRepartidorApp ?: return
        PushRegistrar.onNewToken(this, app.repository, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        RouteEvents.requestRefresh(message.data["type"] ?: "fcm")
        if (AppForeground.isInForeground) return
        val title = message.notification?.title ?: message.data["title"]
        val body = message.notification?.body ?: message.data["body"]
        if (!title.isNullOrBlank()) {
            showPushNotification(title, body.orEmpty())
        }
    }

    private fun showPushNotification(title: String, body: String) {
        BravaNotifications.ensureChannels(this)
        val launch =
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        val pi =
            PendingIntent.getActivity(
                this,
                88002,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        val n =
            NotificationCompat.Builder(this, BravaNotifications.PUSH_CHANNEL_ID)
                .setSmallIcon(BravaNotifications.smallIcon())
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setColor(0xFFFF6B35.toInt())
                .build()
        val nm = getSystemService(NotificationManager::class.java)
        nm?.notify((System.currentTimeMillis() % 10000).toInt() + 88002, n)
    }
}
