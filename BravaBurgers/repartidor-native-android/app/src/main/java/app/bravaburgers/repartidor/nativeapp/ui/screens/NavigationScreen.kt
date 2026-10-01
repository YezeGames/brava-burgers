package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.TurnLeft
import androidx.compose.material.icons.filled.TurnRight
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.navigation.BravaNavigationTts
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeTop
import app.bravaburgers.repartidor.nativeapp.ui.map.BravaMapView
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.MpBlue
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary
import kotlinx.coroutines.delay
import java.util.Locale

private val NavFabWhite = Color.White

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NavigationScreen(
    stop: RouteStop,
    navRoute: List<Pair<Double, Double>>,
    navManeuver: String,
    navInstructionPrimary: String,
    navInstructionThen: String?,
    navInstructionThenModifier: String?,
    navManeuverModifier: String?,
    navSpeedKmh: Int,
    navEtaMinutes: Int?,
    navRouteKm: Double?,
    navMeta: String,
    navLoading: Boolean,
    navDest: Pair<Double, Double>?,
    navDriver: Pair<Double, Double>?,
    navDriverBearing: Float? = null,
    navVoiceOn: Boolean,
    onToggleVoice: () -> Unit,
    onStartNavigation: () -> Unit,
    onBack: () -> Unit,
    onLlegue: () -> Unit,
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val navBarBottom =
        WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val sheetBodyHeight = 158.dp
    val sheetTotalHeight = sheetBodyHeight + navBarBottom
    val bottomOverlayPx = with(density) { sheetTotalHeight.toPx().toInt() }
    val floatRowBottom = sheetTotalHeight + 10.dp

    var mapFollow by remember(stop.orn) { mutableStateOf(false) }
    var recenterKey by remember(stop.orn) { mutableIntStateOf(0) }
    var compassKey by remember(stop.orn) { mutableIntStateOf(0) }

    LaunchedEffect(stop.orn) {
        onStartNavigation()
    }

    LaunchedEffect(navLoading, navRoute.size) {
        mapFollow = false
        if (!navLoading && navRoute.size >= 2) {
            delay(1600)
            mapFollow = true
        }
    }

    val primaryText =
        when {
            navLoading -> "Calculando ruta…"
            navInstructionPrimary.isNotBlank() -> navInstructionPrimary
            navManeuver.isNotBlank() -> navManeuver
            else -> "Seguí la ruta resaltada"
        }

    val addressStreet =
        listOfNotNull(
            stop.direccion?.trim()?.takeIf { it.isNotEmpty() },
            stop.piso?.trim()?.takeIf { it.isNotEmpty() }?.let { "Piso $it" },
        ).joinToString(" · ")
    val addressZone = stop.localidad?.trim()?.takeIf { it.isNotEmpty() }.orEmpty()

    Box(modifier = Modifier.fillMaxSize().background(BgDark)) {
        BravaMapView(
            modifier = Modifier.fillMaxSize(),
            route = navRoute,
            destination = navDest,
            driver = navDriver,
            recenterKey = recenterKey,
            compassResetKey = compassKey,
            navigationFollow = mapFollow,
            driverBearing = navDriverBearing,
            navigationMode = true,
            bottomOverlayPx = bottomOverlayPx,
            onUserMovedMap = {
                if (!navLoading && navRoute.size >= 2) {
                    mapFollow = false
                }
            },
        )

        NavTopInstructionBanner(
            primary = primaryText,
            thenInstruction = navInstructionThen,
            thenModifier = navInstructionThenModifier,
            primaryModifier = navManeuverModifier,
            loading = navLoading,
        )

        NavSpeedChip(
            speedKmh = navSpeedKmh,
            modifier =
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 12.dp, bottom = floatRowBottom),
        )

        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 12.dp, bottom = floatRowBottom),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            NavRoundMapButton(
                onClick = {
                    mapFollow = false
                    compassKey++
                },
                contentDescription = "Brújula / vista norte",
            ) {
                Icon(Icons.Default.Explore, contentDescription = null, tint = BravaOrange)
            }
            NavRoundMapButton(
                onClick = onToggleVoice,
                onLongClick = { BravaNavigationTts.openGoogleTtsSettings(context) },
                contentDescription = "Voz",
            ) {
                Icon(
                    imageVector =
                        if (navVoiceOn) {
                            Icons.AutoMirrored.Filled.VolumeUp
                        } else {
                            Icons.AutoMirrored.Filled.VolumeOff
                        },
                    contentDescription = null,
                    tint = if (navVoiceOn) BravaOrange else TextMuted,
                )
            }
            NavRoundMapButton(
                onClick = {
                    mapFollow = true
                    recenterKey++
                },
                contentDescription = "Centrar en tu ubicación",
                highlighted = !mapFollow,
            ) {
                Icon(Icons.Default.MyLocation, contentDescription = null, tint = MpBlue)
            }
        }

        NavBottomTripBar(
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth(),
            etaMinutes = navEtaMinutes,
            routeKm = navRouteKm,
            addressStreet = addressStreet,
            addressZone = addressZone,
            onExit = onBack,
            onLlegue = onLlegue,
            navLoading = navLoading,
            navBarBottom = navBarBottom,
            sheetBodyHeight = sheetBodyHeight,
        )
    }
}

@Composable
private fun NavTopInstructionBanner(
    primary: String,
    thenInstruction: String?,
    thenModifier: String?,
    primaryModifier: String?,
    loading: Boolean,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .bravaSafeTop()
                .padding(start = 10.dp, end = 10.dp, top = 8.dp),
    ) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .shadow(6.dp, RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                    .background(
                        SurfaceDark,
                        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                    )
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (loading) {
                CircularProgressIndicator(
                    color = BravaOrange,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(36.dp),
                )
            } else {
                Icon(
                    imageVector = maneuverIcon(primaryModifier, primary),
                    contentDescription = null,
                    tint = BravaOrange,
                    modifier = Modifier.size(36.dp),
                )
            }
            Text(
                text = primary,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                fontSize = 17.sp,
                lineHeight = 22.sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 12.dp),
            )
        }
        if (!thenInstruction.isNullOrBlank()) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .background(
                            BgDark,
                            RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp),
                        )
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Luego",
                    color = BravaOrange.copy(alpha = 0.95f),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                )
                Icon(
                    maneuverIcon(thenModifier, thenInstruction),
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(22.dp).padding(horizontal = 6.dp),
                )
                Text(
                    thenInstruction,
                    color = Color.White.copy(alpha = 0.92f),
                    fontSize = 14.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        } else {
            Spacer(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .background(
                            BgDark,
                            RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp),
                        ),
            )
        }
    }
}

@Composable
private fun NavSpeedChip(
    speedKmh: Int,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .size(52.dp)
                .shadow(4.dp, CircleShape)
                .clip(CircleShape)
                .background(NavFabWhite),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = speedKmh.coerceAtLeast(0).toString(),
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
                color = Color(0xFF202124),
            )
            Text(
                text = "km/h",
                fontSize = 9.sp,
                color = TextMuted,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun NavRoundMapButton(
    onClick: () -> Unit,
    contentDescription: String,
    onLongClick: (() -> Unit)? = null,
    highlighted: Boolean = false,
    content: @Composable () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .size(46.dp)
                .shadow(4.dp, CircleShape)
                .clip(CircleShape)
                .background(NavFabWhite)
                .then(
                    if (highlighted) {
                        Modifier.border(2.dp, BravaOrange, CircleShape)
                    } else {
                        Modifier
                    },
                )
                .then(
                    if (onLongClick != null) {
                        Modifier.combinedClickable(
                            onClick = onClick,
                            onLongClick = onLongClick,
                        )
                    } else {
                        Modifier.combinedClickable(onClick = onClick)
                    },
                ),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

@Composable
private fun NavBottomTripBar(
    modifier: Modifier = Modifier,
    etaMinutes: Int?,
    routeKm: Double?,
    addressStreet: String,
    addressZone: String,
    onExit: () -> Unit,
    onLlegue: () -> Unit,
    navLoading: Boolean,
    navBarBottom: androidx.compose.ui.unit.Dp,
    sheetBodyHeight: androidx.compose.ui.unit.Dp,
) {
    Column(
        modifier =
            modifier.background(BgDark),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(sheetBodyHeight)
                    .padding(top = 12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = onExit,
                    modifier =
                        Modifier
                            .size(44.dp)
                            .background(LineDark, CircleShape),
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Salir", tint = TextPrimary)
                }
                Column(
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text =
                            if (etaMinutes != null) {
                                "$etaMinutes min"
                            } else {
                                "— min"
                            },
                        color = BravaOrange,
                        fontWeight = FontWeight.Bold,
                        fontSize = 26.sp,
                    )
                    val sub =
                        buildList {
                            if (addressStreet.isNotBlank()) add(addressStreet)
                            if (addressZone.isNotBlank()) add(addressZone)
                            routeKm?.let { add(String.format(Locale.US, "%.1f km", it)) }
                        }.joinToString(" · ")
                    if (sub.isNotBlank()) {
                        Text(
                            sub,
                            color = TextMuted,
                            fontSize = 13.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Spacer(modifier = Modifier.size(44.dp))
            }
            Button(
                onClick = onLlegue,
                enabled = !navLoading,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 16.dp, end = 16.dp, top = 8.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BravaOrange),
            ) {
                Text("Llegué", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        }
        Spacer(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(navBarBottom)
                    .background(BgDark),
        )
    }
}

private fun maneuverIcon(modifier: String?, instruction: String): ImageVector {
    val m = modifier.orEmpty().lowercase()
    if (m.contains("right")) return Icons.Default.TurnRight
    if (m.contains("left") || m.contains("uturn")) return Icons.Default.TurnLeft
    val t = instruction.lowercase()
    if (t.contains("derecha")) return Icons.Default.TurnRight
    if (t.contains("izquierda") || t.contains("u-turn") || t.contains("giro en u")) {
        return Icons.Default.TurnLeft
    }
    return Icons.Default.Navigation
}
