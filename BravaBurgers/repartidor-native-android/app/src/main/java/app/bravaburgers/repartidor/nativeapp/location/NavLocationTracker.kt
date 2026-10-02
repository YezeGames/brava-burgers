package app.bravaburgers.repartidor.nativeapp.location

import android.content.Context
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/** GPS en vivo en pantalla de navegación (punto azul del repartidor). */
class NavLocationTracker(context: Context) {
    private val appContext = context.applicationContext
    private val fused = LocationServices.getFusedLocationProviderClient(appContext)
    private var callback: LocationCallback? = null

    fun start(
        onUpdate: (
            lat: Double,
            lng: Double,
            bearingDeg: Float?,
            speedMps: Float?,
            accuracyM: Float?,
        ) -> Unit,
    ) {
        if (!LocationHelper.hasLocationPermission(appContext)) return
        stop()
        val request =
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
                .setMinUpdateIntervalMillis(500L)
                .setMaxUpdateDelayMillis(2000L)
                .setMinUpdateDistanceMeters(0f)
                .build()
        callback =
            object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    val loc = result.lastLocation ?: return
                    val brg =
                        if (loc.hasBearing() && loc.speed > 1.2f) {
                            loc.bearing
                        } else {
                            null
                        }
                    val speed =
                        if (loc.hasSpeed() && loc.speed >= 0f) loc.speed else null
                    val acc = if (loc.hasAccuracy()) loc.accuracy else null
                    onUpdate(loc.latitude, loc.longitude, brg, speed, acc)
                }
            }
        try {
            fused.requestLocationUpdates(request, callback!!, Looper.getMainLooper())
        } catch (_: SecurityException) {
            callback = null
        }
    }

    fun stop() {
        callback?.let { fused.removeLocationUpdates(it) }
        callback = null
    }
}
