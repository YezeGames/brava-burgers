package app.bravaburgers.repartidor.nativeapp.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.HeadsetMic
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
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

/** Paleta pantalla handoff (mock SVG). */
private val HandoffBg = Color(0xFF0D1117)
private val HandoffCard = Color(0xFF161B22)
private val HandoffBorder = Color(0xFF21262D)
private val HandoffMuted = Color(0xFF8B949E)
private val HandoffBtnBorder = Color(0xFF30363D)
private val HandoffPayInner = Color(0xFF0D1117)
private val HandoffOrange = Color(0xFFFF6B35)
private val HandoffOrangeAccent = Color(0xFFFF5522)
private val HandoffOrangeSoft = Color(0xFFF0883E)
private val HandoffAmountBlue = Color(0xFF388BFD)
private val HandoffEfBadgeBg = Color(0xFF2D2618)
private val HandoffEfBadgeFg = Color(0xFFD29922)
private val HandoffCobrarBg = Color(0xFF382914)
private val HandoffBackCircle = Color(0xFF21262D)
private val HandoffWhite = Color(0xFFFFFFFF)

@Composable
fun HandoffScreen(
    stop: RouteStop,
    whatsappSent: Boolean,
    onBack: () -> Unit,
    onEntregado: () -> Unit,
    supportContent: @Composable () -> Unit = {},
) {
    val context = LocalContext.current
    val pay = payUiFor(stop)
    val items = stop.items.orEmpty()
    var showStageAlert by remember(stop.orn, whatsappSent) { mutableStateOf(whatsappSent) }

    Box(modifier = Modifier.fillMaxSize().background(HandoffBg)) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp)
                        .bravaSafeTop()
                        .padding(top = 8.dp, bottom = 12.dp),
            ) {
                HandoffHeaderBar(
                    title = "Parada ${stop.parada ?: "?"}",
                    onBack = onBack,
                    onSupport = { /* FAB en supportContent */ },
                )

                Text(
                    "Revisá el pedido y confirmá la entrega",
                    color = HandoffMuted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(top = 12.dp, bottom = 14.dp, start = 4.dp),
                )

                Column(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(HandoffCard)
                            .border(1.dp, HandoffBorder, RoundedCornerShape(16.dp))
                            .padding(16.dp),
                ) {
                    Text(
                        stop.cliente.orEmpty().uppercase(),
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = HandoffWhite,
                        letterSpacing = 0.5.sp,
                    )
                    val addressLine =
                        buildString {
                            append(stop.direccion.orEmpty())
                            stop.localidad?.takeIf { it.isNotBlank() }?.let {
                                if (isNotEmpty()) append(", ")
                                append(it)
                            }
                            stop.piso?.takeIf { it.isNotBlank() }?.let {
                                if (isNotEmpty()) append(" · Piso $it")
                            }
                        }
                    Text(
                        addressLine,
                        color = HandoffMuted,
                        fontSize = 14.sp,
                        modifier = Modifier.padding(top = 6.dp),
                    )

                    HandoffPaySubcard(pay = pay)

                    HorizontalDivider(
                        color = HandoffBorder,
                        modifier = Modifier.padding(top = 16.dp, bottom = 14.dp),
                    )

                    Text(
                        "PEDIDO",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = HandoffOrangeSoft,
                        letterSpacing = 0.8.sp,
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    if (items.isEmpty()) {
                        Text("Sin detalle de ítems en la app", color = HandoffMuted, fontSize = 13.sp)
                    } else {
                        items.forEach { item ->
                            HandoffItemRow(item)
                        }
                    }
                    Text(
                        "ORN ${stop.orn}",
                        color = HandoffMuted,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                }
            }

            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .background(HandoffBg)
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                        .bravaSafeBottom(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                TextButton(
                    onClick = {
                        val tel = stop.telefono?.filter { it.isDigit() || it == '+' }.orEmpty()
                        if (tel.isNotEmpty()) {
                            context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$tel")))
                        }
                    },
                    modifier =
                        Modifier
                            .weight(1f)
                            .height(52.dp)
                            .border(1.dp, HandoffBtnBorder, RoundedCornerShape(12.dp))
                            .background(HandoffCard, RoundedCornerShape(12.dp)),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("Llamar", color = HandoffOrangeSoft, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
                TextButton(
                    onClick = onEntregado,
                    modifier =
                        Modifier
                            .weight(1.3f)
                            .height(52.dp)
                            .background(HandoffOrangeAccent, RoundedCornerShape(12.dp)),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("Entregado", color = HandoffWhite, fontWeight = FontWeight.Bold, fontSize = 16.sp)
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
        supportContent()
    }
}

@Composable
private fun HandoffHeaderBar(
    title: String,
    onBack: () -> Unit,
    onSupport: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(HandoffCard)
                .border(1.dp, HandoffBorder, RoundedCornerShape(16.dp))
                .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier =
                Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(HandoffBackCircle)
                    .clickable(onClick = onBack),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Volver",
                tint = HandoffWhite,
                modifier = Modifier.size(22.dp),
            )
        }
        Text(
            title,
            modifier = Modifier.weight(1f).padding(start = 10.dp),
            fontWeight = FontWeight.Bold,
            fontSize = 18.sp,
            color = HandoffWhite,
        )
        Box(
            modifier =
                Modifier
                    .size(48.dp)
                    .shadow(
                        elevation = 10.dp,
                        shape = CircleShape,
                        spotColor = HandoffOrange.copy(alpha = 0.45f),
                        ambientColor = HandoffOrange.copy(alpha = 0.25f),
                    )
                    .clip(CircleShape)
                    .background(HandoffOrange)
                    .clickable(onClick = onSupport),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Outlined.HeadsetMic,
                contentDescription = "Soporte",
                tint = HandoffWhite,
                modifier = Modifier.size(26.dp),
            )
        }
    }
}

@Composable
private fun HandoffPaySubcard(pay: app.bravaburgers.repartidor.nativeapp.ui.PayUi) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(top = 16.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(HandoffPayInner)
                .border(1.dp, HandoffBorder, RoundedCornerShape(12.dp))
                .padding(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HandoffMethodBadge(pay.kind)
            pay.stamp?.let { HandoffStampBadge(it, pay.kind) }
            pay.totalLabel?.let {
                Text(
                    it,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp,
                    color = HandoffAmountBlue,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        if (pay.hint.isNotBlank()) {
            Text(
                pay.hint,
                color = HandoffMuted,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                modifier = Modifier.padding(top = 10.dp),
            )
        }
    }
}

@Composable
private fun HandoffMethodBadge(kind: PayKind) {
    val (label, bg, fg) =
        when (kind) {
            PayKind.EFECTIVO -> Triple("Efectivo", HandoffEfBadgeBg, HandoffEfBadgeFg)
            PayKind.MERCADO_PAGO -> Triple("Mercado Pago", Color(0xFF1C384A), Color(0xFF00A8E8))
            PayKind.OTRO -> Triple("Pago", HandoffBorder, HandoffMuted)
        }
    Text(
        label,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        color = fg,
        modifier =
            Modifier
                .background(bg, RoundedCornerShape(6.dp))
                .padding(horizontal = 12.dp, vertical = 7.dp),
    )
}

@Composable
private fun HandoffStampBadge(text: String, kind: PayKind) {
    val bg = if (kind == PayKind.MERCADO_PAGO) Color(0xFF1A3D2E) else HandoffCobrarBg
    val fg = if (kind == PayKind.MERCADO_PAGO) Color(0xFF4CAF50) else HandoffOrangeSoft
    Text(
        text,
        fontSize = 12.sp,
        fontWeight = FontWeight.ExtraBold,
        color = fg,
        modifier =
            Modifier
                .background(bg, RoundedCornerShape(6.dp))
                .padding(horizontal = 12.dp, vertical = 7.dp),
    )
}

@Composable
private fun HandoffItemRow(item: OrderItem) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            "${item.quantity()}× ",
            color = HandoffOrangeSoft,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 15.sp,
        )
        Column {
            Text(
                item.displayName(),
                fontWeight = FontWeight.ExtraBold,
                color = HandoffWhite,
                fontSize = 15.sp,
            )
            item.displayNote()?.let {
                Text(it, color = HandoffMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
            }
        }
    }
}
