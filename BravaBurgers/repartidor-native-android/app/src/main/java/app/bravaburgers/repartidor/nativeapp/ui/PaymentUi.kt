package app.bravaburgers.repartidor.nativeapp.ui

import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import java.text.NumberFormat
import java.util.Locale

enum class PayKind { EFECTIVO, MERCADO_PAGO, OTRO }

data class PayUi(
    val kind: PayKind,
    val stamp: String?,
    val totalLabel: String?,
    val metaLine: String,
    val hint: String,
)

fun payUiFor(stop: RouteStop): PayUi {
    val pago = stop.pago.orEmpty()
    val total = stop.total
    val fmt = NumberFormat.getCurrencyInstance(Locale("es", "AR"))
    val totalStr = if (total != null && total > 0) fmt.format(total) else null
    val isEf = pago.contains("efectivo", ignoreCase = true)
    val isMp =
        pago.contains("mercado", ignoreCase = true) ||
            pago.equals("mp", ignoreCase = true) ||
            pago.contains("mercadopago", ignoreCase = true)

    return when {
        isMp ->
            PayUi(
                kind = PayKind.MERCADO_PAGO,
                stamp = "PAGO",
                totalLabel = totalStr,
                metaLine = "MP pagado",
                hint = "Ya está pago en la app. No cobres efectivo.",
            )
        isEf ->
            PayUi(
                kind = PayKind.EFECTIVO,
                stamp = "COBRAR",
                totalLabel = totalStr,
                metaLine = totalStr?.let { "Cobrar $it" } ?: "Efectivo",
                hint = "Confirmá el monto en mano antes de marcar entregado.",
            )
        else ->
            PayUi(
                kind = PayKind.OTRO,
                stamp = null,
                totalLabel = totalStr,
                metaLine = pago.ifBlank { "Pago" },
                hint = "",
            )
    }
}
