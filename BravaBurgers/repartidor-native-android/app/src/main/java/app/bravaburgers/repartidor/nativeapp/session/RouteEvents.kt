package app.bravaburgers.repartidor.nativeapp.session

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** Avisos de cambio de ruta (poll en background o FCM). */
object RouteEvents {
    private val _refresh = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val refresh = _refresh.asSharedFlow()

    fun requestRefresh(reason: String = "sync") {
        _refresh.tryEmit(reason)
    }
}
