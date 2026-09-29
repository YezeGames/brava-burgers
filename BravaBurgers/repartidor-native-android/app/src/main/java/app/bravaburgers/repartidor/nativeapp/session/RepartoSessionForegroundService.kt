package app.bravaburgers.repartidor.nativeapp.session

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import app.bravaburgers.repartidor.nativeapp.BuildConfig
import app.bravaburgers.repartidor.nativeapp.MainActivity
import app.bravaburgers.repartidor.nativeapp.push.BravaNotifications
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * FGS **solo GPS** mientras hay una entrega `en_camino` (reportTrack ~16 s).
 * Cambios de ruta: **FCM** desde el servidor + refresh al volver a primer plano (sin poll).
 */
class RepartoSessionForegroundService : Service() {
    private val io = Executors.newSingleThreadExecutor()

    private val http =
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private var locationCallback: LocationCallback? = null

    private var token = ""
    private var apiKey = ""
    private var activeOrn = ""
    private var intentionalStop = false

    private var lastSentMs = 0L
    private var lastSentOrn = ""
    private val minSendMs = 16_000L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        BravaNotifications.ensureChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                intentionalStop = true
                tearDown(clearPrefs = true)
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SET_ORN, null -> {
                restoreFromPrefs()
                activeOrn =
                    intent?.getStringExtra(EXTRA_ORN)?.trim()
                        ?: SessionServicePrefs.read(this).activeOrn
                SessionServicePrefs.setActiveOrn(this, activeOrn)
                if (activeOrn.isEmpty() || token.isEmpty()) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                    return START_NOT_STICKY
                }
                enterForeground()
                syncLocationUpdates()
            }
        }
        return START_STICKY
    }

    private fun restoreFromPrefs() {
        val snap = SessionServicePrefs.read(this)
        token = snap.token
        apiKey = snap.apiKey
        if (activeOrn.isEmpty()) activeOrn = snap.activeOrn
    }

    private fun enterForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                buildNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            )
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
    }

    private fun buildNotification(): Notification {
        val launch =
            PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        return NotificationCompat.Builder(this, BravaNotifications.SESSION_CHANNEL_ID)
            .setSmallIcon(BravaNotifications.smallIcon())
            .setContentTitle("Brava · entrega en curso")
            .setContentText("Enviando ubicación al cliente")
            .setOngoing(true)
            .setContentIntent(launch)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

    private fun hasLocationPermission(): Boolean {
        val fine =
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        val coarse =
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    private fun syncLocationUpdates() {
        if (activeOrn.isEmpty() || !hasLocationPermission()) {
            locationCallback?.let { fused.removeLocationUpdates(it) }
            locationCallback = null
            return
        }
        locationCallback?.let { fused.removeLocationUpdates(it) }
        locationCallback = null
        val request =
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 4000L)
                .setMinUpdateIntervalMillis(3000L)
                .setWaitForAccurateLocation(false)
                .build()
        locationCallback =
            object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    val loc = result.lastLocation ?: return
                    val now = System.currentTimeMillis()
                    if (now - lastSentMs < minSendMs && activeOrn == lastSentOrn) return
                    lastSentMs = now
                    lastSentOrn = activeOrn
                    val orn = activeOrn
                    io.execute { postReportTrack(orn, loc.latitude, loc.longitude) }
                }
            }
        try {
            fused.requestLocationUpdates(request, locationCallback!!, Looper.getMainLooper())
        } catch (_: SecurityException) {
            locationCallback = null
        }
    }

    private fun postReportTrack(orn: String, lat: Double, lng: Double) {
        if (orn.isEmpty() || token.isEmpty()) return
        try {
            val body =
                JSONObject().apply {
                    put("action", "reportTrack")
                    put("orn", orn)
                    put("lat", lat)
                    put("lng", lng)
                    put("repartidorToken", token)
                    if (apiKey.isNotEmpty()) put("key", apiKey)
                }
            val req =
                Request.Builder()
                    .url(BuildConfig.API_BASE)
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()
            http.newCall(req).execute().close()
        } catch (_: Exception) {
        }
    }

    private fun tearDown(clearPrefs: Boolean) {
        locationCallback?.let { fused.removeLocationUpdates(it) }
        locationCallback = null
        if (clearPrefs) SessionServicePrefs.clear(this)
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        val snap = SessionServicePrefs.read(this)
        if (snap.sessionOn && snap.activeOrn.isNotEmpty()) {
            ensureGpsIfNeeded(this)
        }
    }

    override fun onDestroy() {
        tearDown(clearPrefs = intentionalStop)
        io.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val NOTIFICATION_ID = 77002
        private const val ACTION_STOP = "app.bravaburgers.repartidor.STOP_SESSION"
        private const val ACTION_SET_ORN = "app.bravaburgers.repartidor.SET_ORN"
        private const val EXTRA_ORN = "orn"

        /** Guarda sesión (token) para FCM; no levanta FGS si no hay entrega en curso. */
        fun persistSession(context: Context, token: String, apiKey: String?, activeOrn: String = "") {
            SessionServicePrefs.setSession(context, token, apiKey, activeOrn)
            if (activeOrn.isNotBlank()) {
                startGps(context, activeOrn)
            }
        }

        fun setActiveOrn(context: Context, orn: String) {
            val trimmed = orn.trim()
            SessionServicePrefs.setActiveOrn(context, trimmed)
            if (trimmed.isEmpty()) {
                context.startService(
                    Intent(context, RepartoSessionForegroundService::class.java).apply {
                        action = ACTION_SET_ORN
                        putExtra(EXTRA_ORN, "")
                    },
                )
            } else {
                startGps(context, trimmed)
            }
        }

        private fun startGps(context: Context, orn: String) {
            val i =
                Intent(context, RepartoSessionForegroundService::class.java).apply {
                    action = ACTION_SET_ORN
                    putExtra(EXTRA_ORN, orn)
                }
            context.startForegroundService(i)
        }

        fun stopSession(context: Context) {
            SessionServicePrefs.clear(context)
            context.startService(
                Intent(context, RepartoSessionForegroundService::class.java).apply {
                    action = ACTION_STOP
                },
            )
        }

        fun ensureGpsIfNeeded(context: Context) {
            val snap = SessionServicePrefs.read(context)
            if (snap.sessionOn && snap.token.isNotEmpty() && snap.activeOrn.isNotEmpty()) {
                startGps(context, snap.activeOrn)
            }
        }
    }
}
