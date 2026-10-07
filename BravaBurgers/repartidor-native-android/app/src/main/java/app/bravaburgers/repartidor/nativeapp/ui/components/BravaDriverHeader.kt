package app.bravaburgers.repartidor.nativeapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeTop
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.OkGreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary
import kotlinx.coroutines.launch

@Composable
fun BravaDriverShell(
    driverName: String,
    connected: Boolean,
    online: Boolean,
    onOnlineChange: (Boolean) -> Unit,
    activeOrders: Int,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth(0.78f)
                        .background(SurfaceDark)
                        .bravaSafeTop()
                        .padding(20.dp),
            ) {
                Text("Menú", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text(
                    "Brava Repartidor",
                    color = TextMuted,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(top = 4.dp, bottom = 24.dp),
                )
                Text(
                    "Cerrar sesión",
                    color = BravaOrange,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp,
                    modifier =
                        Modifier
                            .clickable {
                                scope.launch { drawer.close() }
                                onLogout()
                            }
                            .padding(vertical = 12.dp),
                )
            }
        },
        modifier = modifier,
    ) {
        Column {
            BravaDriverHeaderBar(
                driverName = driverName,
                connected = connected,
                online = online,
                onOnlineChange = onOnlineChange,
                activeOrders = activeOrders,
                onMenuClick = { scope.launch { drawer.open() } },
            )
            content()
        }
    }
}

@Composable
fun BravaDriverHeaderBar(
    driverName: String,
    connected: Boolean,
    online: Boolean,
    onOnlineChange: (Boolean) -> Unit,
    activeOrders: Int,
    onMenuClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .bravaSafeTop()
                .padding(horizontal = 16.dp, vertical = 10.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(SurfaceDark)
                .border(1.dp, LineDark, RoundedCornerShape(16.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HamburgerIcon(modifier = Modifier.clickable(onClick = onMenuClick))
        Box(
            modifier =
                Modifier
                    .padding(start = 12.dp)
                    .width(1.dp)
                    .height(30.dp)
                    .background(LineDark),
        )
        Box(
            modifier =
                Modifier
                    .padding(start = 10.dp)
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(BravaOrange),
            contentAlignment = Alignment.Center,
        ) {
            Text("BRAVA", color = TextPrimary, fontSize = 9.sp, fontWeight = FontWeight.Bold)
        }
        Column(
            modifier =
                Modifier
                    .weight(1f)
                    .padding(start = 10.dp),
        ) {
            Text(
                driverName.ifBlank { "Repartidor" },
                color = TextPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
            )
            val status =
                when {
                    !connected -> "Sin conexión"
                    !online -> "● Desconectado"
                    activeOrders > 0 -> "● Conectado ($activeOrders activa${if (activeOrders == 1) "" else "s"})"
                    else -> "● Conectado"
                }
            Text(
                status,
                color = if (connected && online) OkGreen else TextMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Switch(
            checked = online && connected,
            onCheckedChange = onOnlineChange,
            enabled = connected,
            colors =
                SwitchDefaults.colors(
                    checkedTrackColor = OkGreen,
                    uncheckedTrackColor = LineDark,
                    checkedThumbColor = TextPrimary,
                    uncheckedThumbColor = TextMuted,
                ),
        )
    }
}

@Composable
private fun HamburgerIcon(modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(4.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        repeat(3) { i ->
            Box(
                modifier =
                    Modifier
                        .height(2.dp)
                        .width(if (i == 1) 12.dp else 16.dp)
                        .background(TextPrimary, RoundedCornerShape(1.dp)),
            )
        }
    }
}
