package app.bravaburgers.repartidor.nativeapp.location

import android.content.Context
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

object LocationHelper {
    /** Pair(lat, lng) */
    suspend fun lastLatLng(context: Context): Pair<Double, Double>? =
        suspendCoroutine { cont ->
            val fused = LocationServices.getFusedLocationProviderClient(context)
            val cancel = CancellationTokenSource()
            fused
                .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancel.token)
                .addOnSuccessListener { loc ->
                    if (loc != null) {
                        cont.resume(Pair(loc.latitude, loc.longitude))
                    } else {
                        cont.resume(null)
                    }
                }
                .addOnFailureListener { cont.resume(null) }
        }
}
