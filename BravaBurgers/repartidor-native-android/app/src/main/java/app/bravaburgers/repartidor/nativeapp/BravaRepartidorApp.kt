package app.bravaburgers.repartidor.nativeapp

import android.app.Application
import app.bravaburgers.repartidor.nativeapp.data.RepartidorRepository
import org.maplibre.android.MapLibre

class BravaRepartidorApp : Application() {
    lateinit var repository: RepartidorRepository
        private set

    override fun onCreate() {
        super.onCreate()
        MapLibre.getInstance(this)
        repository = RepartidorRepository(this)
    }
}
