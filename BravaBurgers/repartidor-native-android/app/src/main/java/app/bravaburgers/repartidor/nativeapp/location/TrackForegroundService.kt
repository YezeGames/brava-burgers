package app.bravaburgers.repartidor.nativeapp.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import app.bravaburgers.repartidor.nativeapp.BuildConfig
import app.bravaburgers.repartidor.nativeapp.MainActivity
import app.bravaburgers.repartidor.nativeapp.R
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class TrackForegroundService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val http =
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

    private var token: String = ""
    private var apiKey: String = ""
    private var orn: String = ""
    private var lastSentMs = 0L
    private val minSendMs = 16_000L

    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private var callback: LocationCallback? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                token = intent?.getStringExtra(EXTRA_TOKEN).orEmpty()
                apiKey = intent?.getStringExtra(EXTRA_API_KEY).orEmpty()
                orn = intent?.getStringExtra(EXTRA_ORN).orEmpty()
                if (token.isEmpty() || orn.isEmpty()) {
                    stopSelf()
                    return START_NOT_STICKY
                }
                startForegroundWithType()
                startLocationUpdates()
            }
        }
        return START_STICKY
    }

    private fun startForegroundWithType() {
        ensureChannel()
        val launch =
            PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        val notification =
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification_track)
                .setContentTitle("Brava · entrega en curso")
                .setContentText("Enviando ubicación al cliente")
                .setOngoing(true)
                .setContentIntent(launch)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startLocationUpdates() {
        callback?.let { fused.removeLocationUpdates(it) }
        val request =
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 4000L)
                .setMinUpdateIntervalMillis(3000L)
                .build()
        callback =
            object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    val loc = result.lastLocation ?: return
                    val now = System.currentTimeMillis()
                    if (now - lastSentMs < minSendMs) return
                    lastSentMs = now
                    scope.launch {
                        postTrack(loc.latitude, loc.longitude)
                    }
                }
            }
        fused.requestLocationUpdates(request, callback!!, Looper.getMainLooper())
    }

    private fun postTrack(lat: Double, lng: Double) {
        if (orn.isEmpty()) return
        try {
            val body =
                JSONObject()
                    .put("action", "reportTrack")
                    .put("repartidorToken", token)
                    .put("orn", orn)
                    .put("lat", lat)
                    .put("lng", lng)
            if (apiKey.isNotEmpty()) body.put("key", apiKey)
            val req =
                Request.Builder()
                    .url(BuildConfig.API_BASE)
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()
            http.newCall(req).execute().close()
        } catch (_: Exception) {
        }
    }

    override fun onDestroy() {
        callback?.let { fused.removeLocationUpdates(it) }
        callback = null
        scope.cancel()
        super.onDestroy()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        val ch =
            NotificationChannel(
                CHANNEL_ID,
                "Entrega en curso",
                NotificationManager.IMPORTANCE_LOW,
            )
        ch.description = "GPS activo mientras repartís"
        nm.createNotificationChannel(ch)
    }

    companion object {
        private const val CHANNEL_ID = "brava_track_fgs"
        private const val NOTIFICATION_ID = 77001
        private const val ACTION_STOP = "stop"
        private const val EXTRA_TOKEN = "token"
        private const val EXTRA_API_KEY = "apiKey"
        private const val EXTRA_ORN = "orn"

        fun start(context: Context, token: String, apiKey: String?, orn: String) {
            val i =
                Intent(context, TrackForegroundService::class.java).apply {
                    putExtra(EXTRA_TOKEN, token)
                    putExtra(EXTRA_API_KEY, apiKey.orEmpty())
                    putExtra(EXTRA_ORN, orn)
                }
            context.startForegroundService(i)
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, TrackForegroundService::class.java).apply {
                    action = ACTION_STOP
                },
            )
        }
    }
}
