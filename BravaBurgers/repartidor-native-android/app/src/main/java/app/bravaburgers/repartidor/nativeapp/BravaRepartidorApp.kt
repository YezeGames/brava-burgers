package app.bravaburgers.repartidor.nativeapp

import android.app.Application
import app.bravaburgers.repartidor.nativeapp.data.RepartidorRepository
import app.bravaburgers.repartidor.nativeapp.push.BravaNotifications
import app.bravaburgers.repartidor.nativeapp.realtime.RepartidorRealtimeCoordinator
import app.bravaburgers.repartidor.nativeapp.session.AppForeground
import app.bravaburgers.repartidor.nativeapp.session.RepartoSessionForegroundService
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
        MapLibre.getInstance(this)
        BravaNotifications.ensureChannels(this)
        AppForeground.install()
        repository = RepartidorRepository(this)
        realtime =
            RepartidorRealtimeCoordinator(
                appScope,
                repository.api,
                repository.apiKey,
            )
        RepartoSessionForegroundService.ensureGpsIfNeeded(this)
    }
}
