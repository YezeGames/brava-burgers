package app.bravaburgers.repartidor.nativeapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.ui.payUiFor
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

@Composable
fun BravaOrderCard(
    stop: RouteStop,
    isNext: Boolean,
    modifier: Modifier = Modifier,
    trailingTop: (@Composable () -> Unit)? = null,
) {
    val pay = payUiFor(stop)
    val borderColor = if (isNext) BravaOrange.copy(alpha = 0.55f) else LineDark
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .alpha(if (isNext) 1f else 0.72f)
                .clip(RoundedCornerShape(14.dp))
                .background(SurfaceDark)
                .border(1.dp, borderColor, RoundedCornerShape(14.dp))
                .padding(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${stop.parada ?: "?"}",
                    color = BravaOrange,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                )
                PaymentBadge(pay.kind)
                if (isNext) {
                    Text(
                        "Siguiente",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = BravaOrange,
                        modifier =
                            Modifier
                                .background(BravaOrange.copy(alpha = 0.15f), RoundedCornerShape(6.dp))
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }
            trailingTop?.invoke()
        }
        Text(
            listOfNotNull(stop.direccion, stop.piso?.let { "Piso $it" }).joinToString(" · "),
            fontWeight = FontWeight.SemiBold,
            color = TextPrimary,
            fontSize = 15.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            "${stop.cliente.orEmpty()} · ${pay.metaLine}",
            fontSize = 12.sp,
            color = TextMuted,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}
