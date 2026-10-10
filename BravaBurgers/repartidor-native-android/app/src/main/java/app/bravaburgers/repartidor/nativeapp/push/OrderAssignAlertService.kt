package app.bravaburgers.repartidor.nativeapp.push

import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import app.bravaburgers.repartidor.nativeapp.MainActivity
import app.bravaburgers.repartidor.nativeapp.R
import app.bravaburgers.repartidor.nativeapp.session.AppForeground

/**
 * Repite el aviso de nueva parada hasta que el repartidor abre la app (primer plano).
 * Usa stream de alarma para ser más audible que multimedia en silencio (no garantiza DND).
 */
class OrderAssignAlertService : Service() {
    private var player: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopAlertInternal()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
        }
        if (AppForeground.isInForeground) {
            stopSelf()
            return START_NOT_STICKY
        }
        val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "Nueva parada en tu ruta" }
        val body =
            intent?.getStringExtra(EXTRA_BODY).orEmpty().ifBlank {
                "Tenés una entrega asignada. Abrí Brava Repartidor."
            }
        BravaNotifications.ensureChannels(this)
        startForeground(NOTIFICATION_ID, buildAlertNotification(title, body))
        startLoopingSound()
        return START_STICKY
    }

    override fun onDestroy() {
        stopAlertInternal()
        super.onDestroy()
    }

    private fun buildAlertNotification(title: String, body: String) =
        NotificationCompat.Builder(this, BravaNotifications.PUSH_CHANNEL_ID)
            .setSmallIcon(BravaNotifications.smallIcon())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setAutoCancel(false)
            .setSound(BravaNotifications.assignSoundUri(this))
            .setContentIntent(openAppPendingIntent())
            .setColor(0xFFFF6B35.toInt())
            .build()

    private fun openAppPendingIntent(): PendingIntent {
        val launch =
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(BravaFcmService.EXTRA_OPEN_ROUTE, true)
                putExtra(BravaFcmService.EXTRA_PUSH_TYPE, "route_assign")
            }
        return PendingIntent.getActivity(
            this,
            88015,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun startLoopingSound() {
        stopAlertInternal()
        acquireWakeLock()
        val attrs =
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        player =
            (MediaPlayer.create(this, R.raw.brava_rider_extended, attrs, 0)
                ?: MediaPlayer.create(this, R.raw.brava_rider_extended))?.apply {
                setAudioAttributes(attrs)
                isLooping = true
                setOnErrorListener { _, _, _ ->
                    stopAlertInternal()
                    stopSelf()
                    true
                }
                start()
            }
        if (player == null) {
            stopAlertInternal()
            stopSelf()
        }
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(PowerManager::class.java) ?: return
        wakeLock =
            pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "brava:order_assign_alert").apply {
                setReferenceCounted(false)
                acquire(10 * 60 * 1000L)
            }
    }

    private fun stopAlertInternal() {
        player?.run {
            try {
                if (isPlaying) stop()
            } catch (_: Exception) {
            }
            release()
        }
        player = null
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        wakeLock = null
    }

    companion object {
        private const val ACTION_STOP = "app.bravaburgers.repartidor.STOP_ORDER_ALERT"
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_BODY = "body"
        private const val NOTIFICATION_ID = 88016

        fun shouldLoopForType(type: String): Boolean = type == "route_assign"

        fun start(context: Context, title: String, body: String) {
            if (AppForeground.isInForeground) return
            val app = context.applicationContext
            val intent =
                Intent(app, OrderAssignAlertService::class.java).apply {
                    putExtra(EXTRA_TITLE, title)
                    putExtra(EXTRA_BODY, body)
                }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                app.startForegroundService(intent)
            } else {
                app.startService(intent)
            }
        }

        fun stop(context: Context) {
            val app = context.applicationContext
            app.startService(
                Intent(app, OrderAssignAlertService::class.java).apply {
                    action = ACTION_STOP
                },
            )
            val nm = app.getSystemService(NotificationManager::class.java)
            nm?.cancel(NOTIFICATION_ID)
            nm?.cancel(88010)
        }
    }
}
