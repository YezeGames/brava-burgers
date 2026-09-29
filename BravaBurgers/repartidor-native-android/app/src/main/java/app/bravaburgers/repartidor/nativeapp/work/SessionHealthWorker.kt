package app.bravaburgers.repartidor.nativeapp.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.bravaburgers.repartidor.nativeapp.BravaRepartidorApp
import app.bravaburgers.repartidor.nativeapp.push.PushRegistrar
import app.bravaburgers.repartidor.nativeapp.session.RouteGpsSync
import app.bravaburgers.repartidor.nativeapp.session.SessionServicePrefs

class SessionHealthWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val snap = SessionServicePrefs.read(applicationContext)
        if (!snap.sessionOn || snap.token.isEmpty()) return Result.success()
        val repo = (applicationContext as? BravaRepartidorApp)?.repository ?: return Result.retry()
        val list =
            repo.fetchRoute(snap.token).getOrNull()
                ?: return Result.retry()
        RouteGpsSync.syncFromStops(applicationContext, snap.token, repo.apiKey, list, trackingOrn = snap.activeOrn)
        PushRegistrar.registerAfterLogin(applicationContext, repo, snap.token)
        return Result.success()
    }
}
