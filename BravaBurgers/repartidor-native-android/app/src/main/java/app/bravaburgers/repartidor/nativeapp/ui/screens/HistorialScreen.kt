package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.ui.PayKind
import app.bravaburgers.repartidor.nativeapp.ui.payUiFor
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.OkGreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary
import java.text.NumberFormat
import java.util.Locale

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

    val fmt = NumberFormat.getCurrencyInstance(Locale("es", "AR"))
    val efectivoTotal =
        items
            .filter { payUiFor(it.stop).kind == PayKind.EFECTIVO }
            .mapNotNull { it.stop.total }
            .filter { it > 0 }
            .sum()
    val efectivoLabel = if (efectivoTotal > 0) fmt.format(efectivoTotal) else "—"

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                HistorialSummaryCard(
                    title = "Entregas hoy",
                    value = items.size.toString(),
                    modifier = Modifier.weight(1f),
                )
                HistorialSummaryCard(
                    title = "Efectivo en mano",
                    value = efectivoLabel,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        items(items, key = { it.stop.orn }) { row ->
            HistorialCompactRow(row)
        }
    }
}

@Composable
private fun HistorialSummaryCard(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .clip(RoundedCornerShape(14.dp))
                .background(SurfaceDark)
                .border(1.dp, LineDark, RoundedCornerShape(14.dp))
                .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(title, color = TextMuted, fontSize = 12.sp)
        Spacer(modifier = Modifier.height(6.dp))
        Text(value, color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 20.sp)
    }
}

@Composable
private fun HistorialCompactRow(row: HistorialEntregaUi) {
    val pay = payUiFor(row.stop)
    val payLabel =
        when (pay.kind) {
            PayKind.EFECTIVO -> "Efectivo"
            PayKind.MERCADO_PAGO -> "Mercado Pago"
            PayKind.OTRO -> pay.metaLine
        }
    val monto =
        row.stop.total?.let {
            if (it > 0) NumberFormat.getCurrencyInstance(Locale("es", "AR")).format(it) else row.monto
        } ?: row.monto
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(SurfaceDark)
                .border(1.dp, LineDark, RoundedCornerShape(12.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "ORN ${row.stop.orn}",
                color = TextPrimary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                maxLines = 1,
            )
            Text(
                row.direccion,
                color = TextMuted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(monto, color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1)
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                row.stop.cliente.orEmpty(),
                color = TextMuted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(payLabel, color = TextMuted, fontSize = 11.sp, maxLines = 1)
            Text(
                "✓ Entregado · ${row.hora}",
                color = OkGreen,
                fontWeight = FontWeight.SemiBold,
                fontSize = 11.sp,
                maxLines = 1,
            )
        }
    }
}
