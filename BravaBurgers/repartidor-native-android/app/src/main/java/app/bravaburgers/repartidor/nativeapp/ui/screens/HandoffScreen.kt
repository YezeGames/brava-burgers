package app.bravaburgers.repartidor.nativeapp.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.OrderItem
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.ui.PayKind
import app.bravaburgers.repartidor.nativeapp.ui.payUiFor
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.EfYellow
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.MpBlue
import app.bravaburgers.repartidor.nativeapp.ui.theme.OkGreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HandoffScreen(
    stop: RouteStop,
    whatsappSent: Boolean,
    onBack: () -> Unit,
    onEntregado: () -> Unit,
) {
    val context = LocalContext.current
    val pay = payUiFor(stop)
    val items = stop.items.orEmpty()

    Column(modifier = Modifier.fillMaxSize().background(BgDark)) {
        LazyColumn(
            modifier =
                Modifier
                    .weight(1f)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver", tint = TextPrimary)
                    }
                }
                Text(
                    "Parada ${stop.parada ?: "?"}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
                Text(
                    if (whatsappSent) "Cliente avisado por WhatsApp" else "Revisá el pedido antes de entregar",
                    color = TextMuted,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(bottom = 12.dp),
                )
                Column(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .background(SurfaceDark, RoundedCornerShape(16.dp))
                            .padding(14.dp),
                ) {
                    Text(stop.cliente.orEmpty(), fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(
                        listOfNotNull(stop.direccion, stop.localidad).joinToString(", "),
                        color = TextMuted,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    if (!stop.piso.isNullOrBlank()) {
                        Text("Piso / depto: ${stop.piso}", color = TextMuted, fontSize = 13.sp)
                    }
                    PayBlock(pay = pay)
                    Text(
                        "PEDIDO",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextMuted,
                        modifier = Modifier.padding(top = 12.dp, bottom = 6.dp),
                    )
                }
            }
            items(items) { item ->
                ItemRow(item)
            }
            item {
                Text("ORN ${stop.orn}", color = TextMuted, fontSize = 11.sp, modifier = Modifier.padding(vertical = 12.dp))
            }
        }
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .background(SurfaceDark)
                    .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedButton(
                onClick = {
                    val tel = stop.telefono?.filter { it.isDigit() || it == '+' }.orEmpty()
                    if (tel.isNotEmpty()) {
                        context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$tel")))
                    }
                },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Llamar")
            }
            Button(
                onClick = onEntregado,
                modifier = Modifier.weight(1.35f),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BravaOrange),
            ) {
                Text("Entregado", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun PayBlock(pay: app.bravaburgers.repartidor.nativeapp.ui.PayUi) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(top = 12.dp)
                .background(BgDark.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                .padding(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            MethodBadge(pay.kind)
            pay.stamp?.let { StampBadge(it, pay.kind) }
            pay.totalLabel?.let {
                Text(it, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            }
        }
        if (pay.hint.isNotBlank()) {
            Text(pay.hint, color = TextMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun MethodBadge(kind: PayKind) {
    val (label, color) =
        when (kind) {
            PayKind.EFECTIVO -> "Efectivo" to EfYellow
            PayKind.MERCADO_PAGO -> "Mercado Pago" to MpBlue
            PayKind.OTRO -> "Pago" to TextMuted
        }
    Text(
        label,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        color = color,
        modifier =
            Modifier
                .background(color.copy(alpha = 0.18f), RoundedCornerShape(8.dp))
                .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

@Composable
private fun StampBadge(text: String, kind: PayKind) {
    val color = if (kind == PayKind.MERCADO_PAGO) OkGreen else EfYellow
    Text(
        text,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        color = color,
        modifier =
            Modifier
                .background(color.copy(alpha = 0.22f), RoundedCornerShape(8.dp))
                .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

@Composable
private fun ItemRow(item: OrderItem) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("${item.quantity()}×", color = BravaOrange, fontWeight = FontWeight.Bold)
        Column {
            Text(item.displayName(), fontWeight = FontWeight.SemiBold)
            item.displayNote()?.let { Text(it, color = TextMuted, fontSize = 12.sp) }
        }
    }
}
