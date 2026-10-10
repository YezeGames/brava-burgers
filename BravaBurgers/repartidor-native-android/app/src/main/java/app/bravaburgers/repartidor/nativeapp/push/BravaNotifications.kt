package app.bravaburgers.repartidor.nativeapp.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import app.bravaburgers.repartidor.nativeapp.R

object BravaNotifications {
    /** Canal con sonido custom (nueva parada). ID nuevo para no heredar config vieja del teléfono. */
    const val PUSH_CHANNEL_ID = "brava_entregas_alert_v1"
    const val PUSH_CHANNEL_LEGACY = "brava_entregas"
    const val SESSION_CHANNEL_ID = "brava_reparto_session"

    fun assignSoundUri(context: Context): Uri =
        Uri.parse(
            "android.resource://${context.packageName}/${R.raw.brava_rider_extended}",
        )

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        val soundAttrs =
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        val sound = assignSoundUri(context)
        val entregas =
            NotificationChannel(
                PUSH_CHANNEL_ID,
                "Entregas Brava",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Avisos cuando cocina te asigna paradas (sonido Brava)"
                enableVibration(true)
                enableLights(true)
                setSound(sound, soundAttrs)
            }
        nm.createNotificationChannel(
            NotificationChannel(
                PUSH_CHANNEL_LEGACY,
                "Entregas Brava (anterior)",
                NotificationManager.IMPORTANCE_DEFAULT,
            ),
        )
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
