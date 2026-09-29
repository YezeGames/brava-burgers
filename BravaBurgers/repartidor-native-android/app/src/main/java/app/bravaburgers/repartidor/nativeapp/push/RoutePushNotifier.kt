package app.bravaburgers.repartidor.nativeapp.push

import com.google.firebase.messaging.RemoteMessage

/** Título/cuerpo para FCM (notification + data-only, alineado con lib/repartidorRoutePush.js). */
object RoutePushNotifier {
    fun parse(message: RemoteMessage): Pair<String, String>? {
        val fromNotification = message.notification
        if (!fromNotification?.title.isNullOrBlank()) {
            return fromNotification!!.title!! to fromNotification.body.orEmpty()
        }
        val data = message.data
        val title = data["title"]?.trim().orEmpty()
        val body = data["body"]?.trim().orEmpty()
        if (title.isNotEmpty()) return title to body
        return fallbackFromType(data["type"].orEmpty(), data)
    }

    private fun fallbackFromType(type: String, data: Map<String, String>): Pair<String, String>? {
        return when (type) {
            "route_assign" -> {
                val n = data["count"]?.toIntOrNull() ?: 1
                if (n == 1) {
                    "Nueva parada en tu ruta" to "Tenés 1 entrega asignada. Abrí Brava Repartidor."
                } else {
                    "$n paradas nuevas" to "Cocina te asignó entregas. Abrí Brava Repartidor."
                }
            }
            "route_modified" -> "Ruta modificada" to "Cocina actualizó tu ruta. Abrí la app."
            "route_removed" -> "Paradas quitadas" to "Cocina te sacó paradas de la ruta."
            "route_clear" -> "Ruta vacía" to "Cocina limpió tu ruta en la app."
            "fcm", "" -> null
            else -> "Brava Repartidor" to "Hay novedades en tu ruta."
        }
    }

    fun isRouteAlert(type: String): Boolean = type.startsWith("route_")
}
