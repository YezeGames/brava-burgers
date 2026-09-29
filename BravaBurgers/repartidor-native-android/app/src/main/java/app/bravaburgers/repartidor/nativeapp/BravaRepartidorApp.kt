package app.bravaburgers.repartidor.nativeapp

import android.app.Application
import app.bravaburgers.repartidor.nativeapp.data.RepartidorRepository
import app.bravaburgers.repartidor.nativeapp.push.BravaNotifications
import app.bravaburgers.repartidor.nativeapp.realtime.RepartidorRealtimeCoordinator
import app.bravaburgers.repartidor.nativeapp.push.PushRegistrar
import app.bravaburgers.repartidor.nativeapp.session.AppForeground
import app.bravaburgers.repartidor.nativeapp.session.RepartoSessionForegroundService
import app.bravaburgers.repartidor.nativeapp.session.SessionServicePrefs
import app.bravaburgers.repartidor.nativeapp.session.InstallSessionGuard
import app.bravaburgers.repartidor.nativeapp.session.SessionWorkScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.maplibre.android.MapLibre

class BravaRepartidorApp : Application() {
    lateinit var repository: RepartidorRepository
        private set

    lateinit var realtime: RepartidorRealtimeCoordinator
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        InstallSessionGuard.clearSessionIfNewBuild(this)
        MapLibre.getInstance(this)
        BravaNotifications.ensureChannels(this)
        repository = RepartidorRepository(this)
        realtime =
            RepartidorRealtimeCoordinator(
                appScope,
                repository.api,
                repository.apiKey,
            )
        AppForeground.onForeground = {
            RepartoSessionForegroundService.ensureGpsIfNeeded(this)
            val snap = SessionServicePrefs.read(this)
            if (snap.sessionOn && snap.token.isNotEmpty()) {
                if (!realtime.isLiveForToken(snap.token)) {
                    realtime.start(snap.token)
                }
            }
        }
        AppForeground.install()
        RepartoSessionForegroundService.ensureGpsIfNeeded(this)
        val snap = SessionServicePrefs.read(this)
        if (snap.sessionOn) SessionWorkScheduler.schedule(this)
    }
}
