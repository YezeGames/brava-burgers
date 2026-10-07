package app.bravaburgers.repartidor.nativeapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ListAlt
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeBottom
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

enum class DriverHomeTab { Pedidos, Mapa, Historial }

@Composable
fun BravaDriverBottomBar(
    selected: DriverHomeTab,
    onSelect: (DriverHomeTab) -> Unit,
    showMapTab: Boolean,
    modifier: Modifier = Modifier,
) {
    val tabs =
        buildList {
            add(Triple(DriverHomeTab.Pedidos, "Pedidos", Icons.AutoMirrored.Outlined.ListAlt))
            if (showMapTab) {
                add(Triple(DriverHomeTab.Mapa, "Mapa", Icons.Outlined.Map))
            }
            add(Triple(DriverHomeTab.Historial, "Historial", Icons.Outlined.History))
        }

    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .border(width = 1.dp, color = LineDark)
                .background(SurfaceDark)
                .bravaSafeBottom()
                .height(72.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tabs.forEach { (tab, label, icon) ->
            val active = selected == tab
            BottomTabItem(
                label = label,
                icon = icon,
                active = active,
                onClick = { onSelect(tab) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun BottomTabItem(
    label: String,
    icon: ImageVector,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val color = if (active) BravaOrange else TextMuted
    Column(
        modifier =
            modifier
                .clickable(onClick = onClick)
                .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(icon, contentDescription = label, tint = color)
        Text(
            label,
            color = if (active) BravaOrange else TextMuted,
            fontSize = 11.sp,
            fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
        )
    }
}
