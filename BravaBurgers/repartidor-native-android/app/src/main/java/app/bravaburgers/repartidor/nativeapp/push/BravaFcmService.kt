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
        val type = message.data["type"] ?: "fcm"
        if (type == "app_update") {
            RouteEvents.requestRefresh("app_update")
            val parsed = RoutePushNotifier.parse(message)
            if (parsed != null && !AppForeground.isInForeground) {
                showPushNotification(parsed.first, parsed.second, type)
            }
            return
        }
        RouteEvents.requestRefresh(type)
        val parsed = RoutePushNotifier.parse(message) ?: return
        val routeAlert = RoutePushNotifier.isRouteAlert(type)
        if (!routeAlert && AppForeground.isInForeground) return
        showPushNotification(parsed.first, parsed.second, type)
    }

    private fun showPushNotification(title: String, body: String, type: String) {
        BravaNotifications.ensureChannels(this)
        val launch =
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_OPEN_ROUTE, true)
                putExtra(EXTRA_PUSH_TYPE, type)
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
                .setCategory(NotificationCompat.CATEGORY_EVENT)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setColor(0xFFFF6B35.toInt())
                .setGroup("brava_repartidor_route")
                .build()
        val nm = getSystemService(NotificationManager::class.java)
        nm?.notify(notificationId(type), n)
    }

    private fun notificationId(type: String): Int =
        when (type) {
            "route_assign" -> 88010
            "route_modified" -> 88011
            "route_removed" -> 88012
            "route_clear" -> 88013
            "app_update" -> 88014
            else -> 88002
        }

    companion object {
        const val EXTRA_OPEN_ROUTE = "open_route"
        const val EXTRA_PUSH_TYPE = "push_type"
    }
}
