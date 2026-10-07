package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.ui.components.PaymentBadge
import app.bravaburgers.repartidor.nativeapp.ui.payUiFor
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.OkGreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

data class HistorialEntregaUi(
    val orden: String,
    val hora: String,
    val direccion: String,
    val monto: String,
    val stop: app.bravaburgers.repartidor.nativeapp.data.RouteStop,
)

@Composable
fun HistorialScreen(
    items: List<HistorialEntregaUi>,
    modifier: Modifier = Modifier,
) {
    if (items.isEmpty()) {
        Column(
            modifier = modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Historial", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(
                "Acá vas a ver entregas completadas (orden, pago, hora y monto).",
                color = TextMuted,
                fontSize = 14.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        return
    }

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(items, key = { it.orden }) { row ->
            HistorialRow(row)
        }
    }
}

@Composable
private fun HistorialRow(item: HistorialEntregaUi) {
    val pay = payUiFor(item.stop)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(SurfaceDark, RoundedCornerShape(16.dp))
                .border(1.dp, LineDark, RoundedCornerShape(16.dp))
                .padding(14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("#${item.orden}", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                PaymentBadge(pay.kind)
            }
            Text(item.hora, color = TextMuted, fontSize = 12.sp)
        }
        Text(
            "Entregado",
            color = OkGreen,
            fontWeight = FontWeight.SemiBold,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            item.direccion,
            color = TextPrimary,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(item.monto, color = TextMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
    }
}
