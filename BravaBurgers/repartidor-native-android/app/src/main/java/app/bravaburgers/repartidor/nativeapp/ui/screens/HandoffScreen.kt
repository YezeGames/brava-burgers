package app.bravaburgers.repartidor.nativeapp.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.OrderItem
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.ui.PayKind
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeBottom
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeTop
import app.bravaburgers.repartidor.nativeapp.ui.components.StageAlertOverlay
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
    var showStageAlert by remember(stop.orn, whatsappSent) { mutableStateOf(whatsappSent) }

    Box(modifier = Modifier.fillMaxSize().background(BgDark)) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 14.dp)
                        .bravaSafeTop()
                        .padding(top = 4.dp, bottom = 12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
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
                    "Revisá el pedido y confirmá la entrega",
                    color = TextMuted,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(bottom = 12.dp),
                )

                Column(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .background(SurfaceDark, RoundedCornerShape(16.dp))
                            .border(1.dp, LineDark, RoundedCornerShape(16.dp))
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

                    HorizontalDivider(
                        color = LineDark,
                        modifier = Modifier.padding(vertical = 14.dp),
                    )

                    Text(
                        "PEDIDO",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = BravaOrange,
                        letterSpacing = 1.sp,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    if (items.isEmpty()) {
                        Text("Sin detalle de ítems en la app", color = TextMuted, fontSize = 13.sp)
                    } else {
                        items.forEach { item ->
                            ItemRow(item)
                        }
                    }
                    Text(
                        "ORN ${stop.orn}",
                        color = TextMuted,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
            }

            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .background(SurfaceDark)
                        .border(width = 1.dp, color = LineDark)
                        .padding(horizontal = 12.dp, vertical = 12.dp)
                        .bravaSafeBottom(),
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

        StageAlertOverlay(
            visible = showStageAlert,
            title = "Cliente avisado",
            message = "Le notificamos que llegaste. Podés entregar el pedido.",
            modifier = Modifier.align(Alignment.TopCenter),
            onDismiss = { showStageAlert = false },
        )
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
            Text(item.displayName(), fontWeight = FontWeight.SemiBold, color = TextPrimary)
            item.displayNote()?.let { Text(it, color = TextMuted, fontSize = 12.sp) }
        }
    }
}
