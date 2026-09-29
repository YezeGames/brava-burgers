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

    fun start(onUpdate: (lat: Double, lng: Double) -> Unit) {
        if (!LocationHelper.hasLocationPermission(appContext)) return
        stop()
        val request =
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 3000L)
                .setMinUpdateIntervalMillis(2000L)
                .setMaxUpdateDelayMillis(6000L)
                .build()
        callback =
            object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    val loc = result.lastLocation ?: return
                    onUpdate(loc.latitude, loc.longitude)
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
