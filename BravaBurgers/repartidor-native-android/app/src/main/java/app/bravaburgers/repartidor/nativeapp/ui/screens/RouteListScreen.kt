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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.data.Session
import app.bravaburgers.repartidor.nativeapp.ui.components.BravaDriverBottomBar
import app.bravaburgers.repartidor.nativeapp.ui.components.BravaDriverShell
import app.bravaburgers.repartidor.nativeapp.ui.components.DriverHomeTab
import app.bravaburgers.repartidor.nativeapp.ui.components.PaymentBadge
import app.bravaburgers.repartidor.nativeapp.ui.payUiFor
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.OkGreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteListScreen(
    session: Session,
    stops: List<RouteStop>,
    connected: Boolean,
    refreshing: Boolean,
    tripStarted: Boolean,
    loading: Boolean,
    deliveryHistory: List<HistorialEntregaUi>,
    homeMapDriver: Pair<Double, Double>?,
    homeMapWaitingGps: Boolean,
    onRefresh: () -> Unit,
    onLogout: () -> Unit,
    onIniciarRecorrido: () -> Unit,
    onContinuar: () -> Unit,
    onStartHomeMapPreview: () -> Unit = {},
    onStopHomeMapPreview: () -> Unit = {},
) {
    var homeTab by rememberSaveable { mutableStateOf(DriverHomeTab.Pedidos.name) }
    var driverOnline by rememberSaveable { mutableStateOf(true) }

    val selectedTab =
        runCatching { DriverHomeTab.valueOf(homeTab) }.getOrDefault(DriverHomeTab.Pedidos)

    val hasPending =
        stops.any { s ->
            s.estado.equals("en_camino", true) || s.estado.equals("en_preparacion", true)
        }
    val activeDelivery = tripStarted && hasPending
    val showMapTab = !activeDelivery

    LaunchedEffect(activeDelivery) {
        if (!showMapTab && selectedTab == DriverHomeTab.Mapa) {
            homeTab = DriverHomeTab.Pedidos.name
            onStopHomeMapPreview()
        }
    }

    val nextIndex =
        stops.indexOfFirst { s ->
            s.estado.equals("en_camino", true) || s.estado.equals("en_preparacion", true)
        }.let { if (it >= 0) it else 0 }

    BravaDriverShell(
        driverName = session.nombre.ifBlank { session.login },
        connected = connected,
        online = driverOnline,
        onOnlineChange = { driverOnline = it },
        activeOrders = if (hasPending) stops.count { !it.estado.equals("entregado", true) } else 0,
        onLogout = onLogout,
        modifier = Modifier.fillMaxSize().background(BgDark),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Box(modifier = Modifier.weight(1f)) {
                when (selectedTab) {
                    DriverHomeTab.Pedidos ->
                        PedidosTabContent(
                            stops = stops,
                            loading = loading,
                            refreshing = refreshing,
                            activeDelivery = activeDelivery,
                            nextIndex = nextIndex,
                            onRefresh = onRefresh,
                        )
                    DriverHomeTab.Mapa -> {
                        DisposableEffect(Unit) {
                            onStartHomeMapPreview()
                            onDispose { onStopHomeMapPreview() }
                        }
                        Column(modifier = Modifier.fillMaxSize()) {
                            Text(
                                "Tu posición",
                                color = TextPrimary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp),
                            )
                            HomeMapCardScreen(
                                driver = homeMapDriver,
                                waitingGps = homeMapWaitingGps,
                                modifier =
                                    Modifier
                                        .fillMaxWidth()
                                        .weight(1f)
                                        .padding(bottom = 8.dp),
                            )
                        }
                    }
                    DriverHomeTab.Historial ->
                        HistorialScreen(
                            items = deliveryHistory,
                            modifier = Modifier.fillMaxSize(),
                        )
                }
            }

            if (selectedTab == DriverHomeTab.Pedidos && hasPending && stops.isNotEmpty()) {
                Button(
                    onClick = { if (tripStarted) onContinuar() else onIniciarRecorrido() },
                    enabled = !loading && driverOnline,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                            .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BravaOrange),
                ) {
                    Text(
                        if (tripStarted) "Continuar entrega" else "Iniciar recorrido",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = null,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }

            BravaDriverBottomBar(
                selected = selectedTab,
                onSelect = { tab ->
                    if (tab == DriverHomeTab.Mapa && !showMapTab) return@BravaDriverBottomBar
                    if (selectedTab == DriverHomeTab.Mapa && tab != DriverHomeTab.Mapa) {
                        onStopHomeMapPreview()
                    }
                    if (tab == DriverHomeTab.Mapa) onStartHomeMapPreview()
                    homeTab = tab.name
                },
                showMapTab = showMapTab,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PedidosTabContent(
    stops: List<RouteStop>,
    loading: Boolean,
    refreshing: Boolean,
    activeDelivery: Boolean,
    nextIndex: Int,
    onRefresh: () -> Unit,
) {
    PullToRefreshBox(isRefreshing = refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (activeDelivery) {
                item {
                    Text(
                        "Entrega en curso",
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                }
            }
            if (loading && stops.isEmpty()) {
                item { LoadingPedidos() }
            } else if (stops.isEmpty() && !loading) {
                item { EmptyPedidos() }
            } else {
                itemsIndexed(stops) { index, stop ->
                    ActiveStopCard(stop = stop, isNext = index == nextIndex)
                }
            }
        }
    }
}

@Composable
private fun ActiveStopCard(stop: RouteStop, isNext: Boolean) {
    val pay = payUiFor(stop)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(SurfaceDark)
                .border(1.dp, LineDark, RoundedCornerShape(16.dp))
                .padding(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier =
                        Modifier
                            .size(22.dp)
                            .background(BravaOrange.copy(alpha = 0.2f), RoundedCornerShape(4.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "${stop.parada ?: "?"}",
                        color = BravaOrange,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                    )
                }
                PaymentBadge(pay.kind)
            }
            if (isNext) {
                Text(
                    "Siguiente parada",
                    color = OkGreen,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 12.sp,
                )
            }
        }
        Text(
            "CLIENTE",
            color = TextMuted,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 12.dp),
        )
        Text(
            listOfNotNull(stop.direccion, stop.piso?.let { "Piso $it" }).joinToString(" · "),
            color = TextPrimary,
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(
            "${stop.cliente.orEmpty()} · ${pay.metaLine}",
            color = TextMuted,
            fontSize = 13.sp,
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}

@Composable
private fun LoadingPedidos() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(color = BravaOrange, strokeWidth = 2.dp)
        Spacer(modifier = Modifier.height(12.dp))
        Text("Cargando pedidos…", color = TextMuted, fontSize = 14.sp)
    }
}

@Composable
private fun EmptyPedidos() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp, horizontal = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("No hay pedidos pendientes", color = TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Spacer(modifier = Modifier.height(8.dp))
        Text("Cuando entre uno nuevo, te avisamos.", color = TextMuted, fontSize = 14.sp)
        Spacer(modifier = Modifier.height(12.dp))
        Text("Deslizá hacia abajo para actualizar.", color = TextMuted, fontSize = 12.sp)
    }
}

fun historialFromStop(stop: RouteStop, deliveredAtMs: Long = System.currentTimeMillis()): HistorialEntregaUi {
    val pay = payUiFor(stop)
    val hora = SimpleDateFormat("HH:mm", Locale("es", "AR")).format(Date(deliveredAtMs))
    return HistorialEntregaUi(
        orden = stop.orn.takeLast(6).ifBlank { stop.parada?.toString() ?: "—" },
        hora = hora,
        direccion = stop.direccion.orEmpty(),
        monto = pay.metaLine,
        stop = stop,
    )
}
