package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.ui.map.BravaMapView
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NavigationScreen(
    stop: RouteStop,
    navRoute: List<Pair<Double, Double>>,
    navManeuver: String,
    navMeta: String,
    navLoading: Boolean,
    navDest: Pair<Double, Double>?,
    onStartNavigation: () -> Unit,
    onBack: () -> Unit,
    onLlegue: () -> Unit,
) {
    LaunchedEffect(stop.orn) {
        onStartNavigation()
    }

    Column(modifier = Modifier.fillMaxSize().background(BgDark)) {
        TopAppBar(
            title = {
                Column {
                    Text("Parada ${stop.parada ?: "?"}", fontWeight = FontWeight.Bold)
                    Text(stop.cliente.orEmpty(), fontSize = 12.sp, color = TextMuted)
                }
            },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceDark),
        )
        BravaMapView(
            modifier = Modifier.weight(1f),
            route = navRoute,
            destination = navDest,
        )
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .background(SurfaceDark, RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp))
                    .padding(14.dp),
        ) {
            if (navLoading) {
                CircularProgressIndicator(color = BravaOrange, modifier = Modifier.padding(bottom = 8.dp))
            }
            Text("Siguiente maniobra", color = BravaOrange, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            Text(
                stop.direccion.orEmpty(),
                fontWeight = FontWeight.Bold,
                color = TextPrimary,
                modifier = Modifier.padding(top = 4.dp, bottom = 4.dp),
            )
            if (navMeta.isNotBlank()) {
                Text(navMeta, color = TextMuted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 8.dp))
            }
            Text(
                navManeuver,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .background(BravaOrange.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
                        .padding(10.dp),
                color = TextPrimary,
            )
            Button(
                onClick = onLlegue,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BravaOrange),
            ) {
                Text("Llegué", fontWeight = FontWeight.Bold)
            }
        }
    }
}
