package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.ui.map.BravaMapView
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.OkGreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

@Composable
fun NavigationScreen(
    stop: RouteStop,
    navRoute: List<Pair<Double, Double>>,
    navManeuver: String,
    navMeta: String,
    navLoading: Boolean,
    navDest: Pair<Double, Double>?,
    navDriver: Pair<Double, Double>?,
    onStartNavigation: () -> Unit,
    onBack: () -> Unit,
    onLlegue: () -> Unit,
) {
    LaunchedEffect(stop.orn) {
        onStartNavigation()
    }

    val addrLine =
        listOfNotNull(
            stop.direccion?.trim()?.takeIf { it.isNotEmpty() },
            stop.piso?.trim()?.takeIf { it.isNotEmpty() }?.let { "Piso $it" },
        ).joinToString(" · ")

    val metaLine =
        buildList {
            if (addrLine.isNotBlank()) add(addrLine)
            if (navMeta.isNotBlank()) add(navMeta)
        }.joinToString(" · ")

    Box(modifier = Modifier.fillMaxSize().background(BgDark)) {
        BravaMapView(
            modifier = Modifier.fillMaxSize(),
            route = navRoute,
            destination = navDest,
            driver = navDriver,
        )

        IconButton(
            onClick = onBack,
            modifier =
                Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 10.dp, top = 10.dp)
                    .background(SurfaceDark.copy(alpha = 0.92f), RoundedCornerShape(12.dp)),
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver", tint = TextPrimary)
        }

        Text(
            text = "● GPS en vivo",
            color = Color(0xFFA5D6A7),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            modifier =
                Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 10.dp, top = 58.dp)
                    .background(BgDark.copy(alpha = 0.85f), RoundedCornerShape(999.dp))
                    .border(1.dp, OkGreen.copy(alpha = 0.5f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 8.dp, vertical = 5.dp),
        )

        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            colors =
                                listOf(
                                    Color.Transparent,
                                    BgDark.copy(alpha = 0.35f),
                                    BgDark,
                                ),
                        ),
                    )
                    .padding(start = 14.dp, end = 14.dp, top = 24.dp, bottom = 18.dp),
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .background(SurfaceDark, RoundedCornerShape(18.dp))
                        .border(1.dp, LineDark, RoundedCornerShape(18.dp))
                        .padding(14.dp),
            ) {
                Text(
                    "Siguiente · Parada ${stop.parada ?: "?"}",
                    color = BravaOrange,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp,
                    letterSpacing = 0.5.sp,
                )
                Text(
                    listOfNotNull(
                        stop.cliente?.trim()?.takeIf { it.isNotEmpty() },
                        stop.localidad?.trim()?.takeIf { it.isNotEmpty() },
                    ).joinToString(" · "),
                    fontWeight = FontWeight.ExtraBold,
                    color = TextPrimary,
                    fontSize = 17.sp,
                    modifier = Modifier.padding(top = 4.dp),
                )
                if (metaLine.isNotBlank()) {
                    Text(
                        metaLine,
                        color = TextMuted,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
                    )
                }
                if (navLoading) {
                    CircularProgressIndicator(
                        color = BravaOrange,
                        strokeWidth = 2.dp,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }
                Text(
                    navManeuver.ifBlank { "Calculando ruta…" },
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .background(BravaOrange.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
                            .border(
                                width = 0.dp,
                                color = Color.Transparent,
                                shape = RoundedCornerShape(10.dp),
                            )
                            .padding(start = 10.dp, top = 8.dp, end = 10.dp, bottom = 8.dp),
                    color = TextPrimary,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                )
                Button(
                    onClick = onLlegue,
                    enabled = !navLoading,
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
}
