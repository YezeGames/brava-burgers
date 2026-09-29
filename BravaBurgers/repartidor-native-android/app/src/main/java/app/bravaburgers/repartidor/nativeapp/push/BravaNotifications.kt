package app.bravaburgers.repartidor.nativeapp.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import app.bravaburgers.repartidor.nativeapp.R

object BravaNotifications {
    const val PUSH_CHANNEL_ID = "brava_entregas"
    const val SESSION_CHANNEL_ID = "brava_reparto_session"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        val entregas =
            NotificationChannel(
                PUSH_CHANNEL_ID,
                "Entregas Brava",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Avisos cuando cocina te asigna paradas"
            }
        val session =
            NotificationChannel(
                SESSION_CHANNEL_ID,
                "Turno repartidor",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Sincronización de ruta y GPS en segundo plano"
            }
        nm.createNotificationChannel(entregas)
        nm.createNotificationChannel(session)
    }

    fun smallIcon(): Int = R.drawable.ic_notification_track
}
