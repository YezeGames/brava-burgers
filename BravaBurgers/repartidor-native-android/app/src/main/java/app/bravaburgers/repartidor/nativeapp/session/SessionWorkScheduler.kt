package app.bravaburgers.repartidor.nativeapp.session

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import app.bravaburgers.repartidor.nativeapp.work.SessionHealthWorker
import java.util.concurrent.TimeUnit

/** Cada ~15 min (mínimo Android): revalidar en_camino, GPS y token FCM sin poll de ruta. */
object SessionWorkScheduler {
    private const val UNIQUE = "brava_reparto_session_health"

    fun schedule(context: Context) {
        val constraints =
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        val req =
            PeriodicWorkRequestBuilder<SessionHealthWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
            UNIQUE,
            ExistingPeriodicWorkPolicy.UPDATE,
            req,
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context.applicationContext).cancelUniqueWork(UNIQUE)
    }
}
