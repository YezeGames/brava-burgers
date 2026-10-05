package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.mapbox.BravaMapboxNavigationView
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted

/** Vista libre Mapbox (sin ruta activa). */
@Composable
fun DriverMapTabScreen(
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize().background(BgDark)) {
        BravaMapboxNavigationView(modifier = Modifier.fillMaxSize())
        Text(
            "Mapbox · free drive",
            modifier =
                Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 12.dp),
            color = TextMuted,
            fontSize = 11.sp,
        )
    }
}
