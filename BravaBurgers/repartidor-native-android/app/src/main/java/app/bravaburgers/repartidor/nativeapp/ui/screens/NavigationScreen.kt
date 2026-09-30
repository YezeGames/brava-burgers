package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.navigation.BravaNavigationTts
import app.bravaburgers.repartidor.nativeapp.ui.map.BravaMapView
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NavigationScreen(
    stop: RouteStop,
    navRoute: List<Pair<Double, Double>>,
    navManeuver: String,
    navMeta: String,
    navLoading: Boolean,
    navDest: Pair<Double, Double>?,
    navDriver: Pair<Double, Double>?,
    navVoiceOn: Boolean,
    onToggleVoice: () -> Unit,
    onStartNavigation: () -> Unit,
    onBack: () -> Unit,
    onLlegue: () -> Unit,
) {
    val context = LocalContext.current

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
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        "Siguiente · Parada ${stop.parada ?: "?"}",
                        color = BravaOrange,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                        letterSpacing = 0.5.sp,
                        modifier = Modifier.weight(1f),
                    )
                    Box(
                        modifier =
                            Modifier
                                .background(
                                    if (navVoiceOn) BravaOrange.copy(alpha = 0.14f) else BgDark,
                                    RoundedCornerShape(12.dp),
                                )
                                .border(
                                    1.dp,
                                    if (navVoiceOn) BravaOrange.copy(alpha = 0.45f) else LineDark,
                                    RoundedCornerShape(12.dp),
                                )
                                .combinedClickable(
                                    onClick = onToggleVoice,
                                    onLongClick = { BravaNavigationTts.openGoogleTtsSettings(context) },
                                )
                                .padding(12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector =
                                if (navVoiceOn) {
                                    Icons.AutoMirrored.Filled.VolumeUp
                                } else {
                                    Icons.AutoMirrored.Filled.VolumeOff
                                },
                            contentDescription =
                                if (navVoiceOn) {
                                    "Silenciar indicaciones por voz. Mantené pulsado para ajustes de voz."
                                } else {
                                    "Activar voz. Mantené pulsado para ajustes de voz."
                                },
                            tint = if (navVoiceOn) BravaOrange else TextMuted,
                        )
                    }
                }
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
