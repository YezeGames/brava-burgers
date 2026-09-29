package app.bravaburgers.repartidor.nativeapp.session

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

/** True cuando la app está visible (primer plano o pantalla encendida con la app arriba). */
object AppForeground {
    @Volatile
    var isInForeground: Boolean = false
        private set

    /** Reconectar Realtime, FCM y GPS al volver a la app. */
    var onForeground: (() -> Unit)? = null

    fun install() {
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    isInForeground = true
                    RouteEvents.requestRefresh("foreground")
                    onForeground?.invoke()
                }

                override fun onStop(owner: LifecycleOwner) {
                    isInForeground = false
                }
            },
        )
    }
}
