package app.bravaburgers.repartidor.nativeapp.ui.screens

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.data.Session
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
fun RouteListScreen(
    session: Session,
    stops: List<RouteStop>,
    connected: Boolean,
    refreshing: Boolean,
    tripStarted: Boolean,
    loading: Boolean,
    onRefresh: () -> Unit,
    onLogout: () -> Unit,
    onIniciarRecorrido: () -> Unit,
    onContinuar: () -> Unit,
) {
    val hasPending =
        stops.any { s ->
            s.estado.equals("en_camino", true) || s.estado.equals("en_preparacion", true)
        }
    val nextIndex =
        stops.indexOfFirst { s ->
            s.estado.equals("en_camino", true) ||
                s.estado.equals("en_preparacion", true)
        }.let { if (it >= 0) it else 0 }

    Column(modifier = Modifier.fillMaxSize().background(BgDark)) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .background(SurfaceDark)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier =
                    Modifier
                        .size(36.dp)
                        .background(BravaOrange, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text("B", color = TextPrimary, fontWeight = FontWeight.Bold)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(session.nombre.ifBlank { session.login }, fontWeight = FontWeight.Bold, color = TextPrimary)
                Text(
                    when {
                        stops.isEmpty() && !loading -> "Ruta completada · sin paradas pendientes"
                        else -> "${stops.size} paradas · orden fijado por cocina"
                    },
                    fontSize = 12.sp,
                    color = TextMuted,
                )
            }
            TextButton(onClick = onLogout) {
                Text("Cerrar sesión", color = TextMuted, fontSize = 13.sp)
            }
        }
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .background(SurfaceDark)
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier =
                    Modifier
                        .size(8.dp)
                        .background(if (connected) OkGreen else TextMuted, CircleShape),
            )
            Text(
                text = if (connected) "Conectado" else "Sin conexión",
                color = if (connected) OkGreen else TextMuted,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = onRefresh,
            modifier = Modifier.weight(1f),
        ) {
            if (stops.isEmpty() && !loading) {
                Column(
                    modifier =
                        Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        if (tripStarted || !hasPending) "¡Listo! Completaste todas las entregas." else "No hay paradas en tu ruta",
                        color = TextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Deslizá hacia abajo para actualizar o cerrá sesión para cambiar de cuenta.",
                        color = TextMuted,
                        fontSize = 13.sp,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    itemsIndexed(stops) { index, stop ->
                        StopCard(stop = stop, isNext = index == nextIndex && stops.isNotEmpty())
                    }
                }
            }
        }
        Button(
            onClick = { if (tripStarted && hasPending) onContinuar() else if (hasPending) onIniciarRecorrido() else onRefresh() },
            enabled = !loading && (stops.isNotEmpty() || !hasPending),
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp)
                    .height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BravaOrange),
        ) {
            Text(
                when {
                    !hasPending && stops.isEmpty() -> "Actualizar ruta"
                    tripStarted && hasPending -> "Continuar entrega"
                    hasPending -> "Iniciar recorrido"
                    else -> "Actualizar ruta"
                },
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun StopCard(stop: RouteStop, isNext: Boolean) {
    val pay = payUiFor(stop)
    val alpha = if (isNext) 1f else 0.72f
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .alpha(alpha)
                .background(SurfaceDark, RoundedCornerShape(14.dp))
                .border(
                    width = 1.dp,
                    color = if (isNext) BravaOrange.copy(alpha = 0.5f) else LineDark,
                    shape = RoundedCornerShape(14.dp),
                )
                .padding(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "${stop.parada ?: "?"}",
                color = BravaOrange,
                fontWeight = FontWeight.Bold,
            )
            PayChip(pay.kind)
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
        Text(
            text = listOfNotNull(stop.direccion, stop.piso?.let { "Piso $it" }).joinToString(" · "),
            fontWeight = FontWeight.SemiBold,
            color = TextPrimary,
            modifier = Modifier.padding(top = 6.dp),
        )
        Text(
            text = "${stop.cliente.orEmpty()} · ${pay.metaLine}",
            fontSize = 12.sp,
            color = TextMuted,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun PayChip(kind: PayKind) {
    val (label, color) =
        when (kind) {
            PayKind.EFECTIVO -> "EF" to EfYellow
            PayKind.MERCADO_PAGO -> "MP" to MpBlue
            PayKind.OTRO -> "—" to TextMuted
        }
    Text(
        label,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        color = color,
        modifier =
            Modifier
                .background(color.copy(alpha = 0.15f), RoundedCornerShape(6.dp))
                .padding(horizontal = 7.dp, vertical = 3.dp),
    )
}
