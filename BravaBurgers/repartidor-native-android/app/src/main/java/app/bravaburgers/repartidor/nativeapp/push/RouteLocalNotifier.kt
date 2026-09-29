package app.bravaburgers.repartidor.nativeapp.push

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import app.bravaburgers.repartidor.nativeapp.MainActivity

/** Aviso en bandeja cuando la app está abierta (mismo canal que FCM). */
object RouteLocalNotifier {
    fun show(context: android.content.Context, title: String, body: String, type: String = "route_modified") {
        BravaNotifications.ensureChannels(context)
        val launch =
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(BravaFcmService.EXTRA_OPEN_ROUTE, true)
                putExtra(BravaFcmService.EXTRA_PUSH_TYPE, type)
            }
        val pi =
            PendingIntent.getActivity(
                context,
                88020 + (System.currentTimeMillis() % 1000).toInt(),
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        val n =
            NotificationCompat.Builder(context, BravaNotifications.PUSH_CHANNEL_ID)
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
                .build()
        context.getSystemService(NotificationManager::class.java)?.notify(88020, n)
    }
}
