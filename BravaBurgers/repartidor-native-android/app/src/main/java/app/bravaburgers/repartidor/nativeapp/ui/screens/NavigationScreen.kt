package app.bravaburgers.repartidor.nativeapp.ui.screens

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.mapbox.BravaMapboxDeliveryActivity
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

/**
 * Prepara destino (geocode) y abre [BravaMapboxDeliveryActivity] — mapa Mapbox fuera de Compose.
 */
@Composable
fun NavigationScreen(
    stop: RouteStop,
    navLoading: Boolean,
    navDest: Pair<Double, Double>?,
    navDriver: Pair<Double, Double>?,
    navErrorHint: String?,
    onStartNavigation: () -> Unit,
    onBack: () -> Unit,
    onLlegue: () -> Unit,
) {
    val context = LocalContext.current
    var mapLaunched by remember(stop.orn) { mutableStateOf(false) }
    var mapSessionDone by remember(stop.orn) { mutableStateOf(false) }

    val mapLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK) {
                mapSessionDone = true
                mapLaunched = true
                onLlegue()
            } else {
                mapLaunched = false
                onBack()
            }
        }

    LaunchedEffect(stop.orn) {
        mapLaunched = false
        mapSessionDone = false
        onStartNavigation()
    }

    LaunchedEffect(navLoading, navDest, navDriver, mapLaunched, mapSessionDone) {
        if (mapSessionDone || mapLaunched || navLoading) return@LaunchedEffect
        val dest = navDest ?: return@LaunchedEffect
        val origin = navDriver ?: return@LaunchedEffect
        mapLaunched = true
        val address =
            listOfNotNull(
                stop.direccion?.trim()?.takeIf { it.isNotEmpty() },
                stop.localidad?.trim()?.takeIf { it.isNotEmpty() },
            ).joinToString(" · ")
        mapLauncher.launch(
            BravaMapboxDeliveryActivity.intent(
                context = context,
                orn = stop.orn,
                originLat = origin.first,
                originLng = origin.second,
                destLat = dest.first,
                destLng = dest.second,
                addressLine = address,
            ),
        )
    }

    Box(
        modifier = Modifier.fillMaxSize().background(BgDark),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = BravaOrange)
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                if (navLoading) "Preparando Mapbox…" else "Abriendo navegación…",
                color = TextPrimary,
                fontSize = 16.sp,
            )
            navErrorHint?.let { hint ->
                Text(
                    hint,
                    color = TextMuted,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(24.dp, 8.dp, 24.dp, 0.dp),
                )
            }
            TextButton(onClick = onBack, modifier = Modifier.padding(top = 12.dp)) {
                Text("Cancelar", color = TextMuted)
            }
        }
    }
}
