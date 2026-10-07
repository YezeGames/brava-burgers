package app.bravaburgers.repartidor.nativeapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.ui.PayKind
import app.bravaburgers.repartidor.nativeapp.ui.theme.EfBadgeBg
import app.bravaburgers.repartidor.nativeapp.ui.theme.EfYellow
import app.bravaburgers.repartidor.nativeapp.ui.theme.MpBadgeBg
import app.bravaburgers.repartidor.nativeapp.ui.theme.MpBlue
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted

@Composable
fun PaymentBadge(kind: PayKind, modifier: Modifier = Modifier) {
    val (label, fg, bg) =
        when (kind) {
            PayKind.EFECTIVO -> Triple("EF", EfYellow, EfBadgeBg)
            PayKind.MERCADO_PAGO -> Triple("MP", MpBlue, MpBadgeBg)
            PayKind.OTRO -> Triple("—", TextMuted, LineMutedBadge)
        }
    Text(
        label,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        color = fg,
        modifier =
            modifier
                .background(bg, RoundedCornerShape(4.dp))
                .padding(horizontal = 7.dp, vertical = 4.dp),
    )
}

private val LineMutedBadge = androidx.compose.ui.graphics.Color(0xFF2D343F)
