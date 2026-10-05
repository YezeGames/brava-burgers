package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

/**
 * Evita un segundo [NavigationView] en home (Mapbox drop-in = una instancia por flujo de guidance).
 * La navegación full-screen abre al tocar Iniciar / Continuar entrega.
 */
@Composable
fun DriverMapTabScreen(
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize().background(BgDark),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "Mapa de navegación\n\nTocá «Iniciar recorrido» o «Continuar entrega» para abrir Mapbox con la ruta.",
            color = TextPrimary,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(28.dp),
        )
        Text(
            "GPS y ruta en cocina siguen activos en segundo plano.",
            color = TextMuted,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(24.dp),
        )
    }
}
