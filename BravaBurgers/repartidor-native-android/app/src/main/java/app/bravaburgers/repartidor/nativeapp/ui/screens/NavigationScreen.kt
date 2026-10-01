package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.navigation.BravaNavigationTts
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeBottom
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeTop
import app.bravaburgers.repartidor.nativeapp.ui.map.BravaMapView
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary
import kotlinx.coroutines.delay
import java.util.Locale

private val MapsBanner = Color(0xFF1F4E5F)
private val MapsBannerThen = Color(0xFF173A47)
private val MapsBlue = Color(0xFF1A73E8)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NavigationScreen(
    stop: RouteStop,
    navRoute: List<Pair<Double, Double>>,
    navManeuver: String,
    navInstructionPrimary: String,
    navInstructionThen: String?,
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

    var mapFollow by remember(stop.orn) { mutableStateOf(false) }
    var showRecenter by remember(stop.orn) { mutableStateOf(false) }
    var recenterKey by remember(stop.orn) { mutableIntStateOf(0) }
    var compassKey by remember(stop.orn) { mutableIntStateOf(0) }

    LaunchedEffect(stop.orn) {
        onStartNavigation()
    }

    LaunchedEffect(navLoading, navRoute.size) {
        mapFollow = false
        showRecenter = false
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

    Box(modifier = Modifier.fillMaxSize()) {
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
            onUserMovedMap = {
                if (!navLoading && navRoute.size >= 2) {
                    mapFollow = false
                    showRecenter = true
                }
            },
        )

        NavTopInstructionBanner(
            primary = primaryText,
            thenInstruction = navInstructionThen,
            modifier = navManeuverModifier,
            loading = navLoading,
        )

        NavSpeedChip(
            speedKmh = navSpeedKmh,
            modifier =
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 16.dp, bottom = 118.dp)
                    .bravaSafeBottom(),
        )

        Column(
            modifier =
                Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 12.dp, bottom = 100.dp)
                    .bravaSafeBottom(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            NavRoundMapButton(
                onClick = {
                    mapFollow = false
                    showRecenter = true
                    compassKey++
                },
                contentDescription = "Brújula / vista norte",
            ) {
                Icon(Icons.Default.Explore, contentDescription = null, tint = MapsBlue)
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
                    tint = if (navVoiceOn) MapsBlue else TextMuted,
                )
            }
            if (showRecenter && !mapFollow) {
                NavRoundMapButton(
                    onClick = {
                        showRecenter = false
                        mapFollow = true
                        recenterKey++
                    },
                    contentDescription = "Centrar en tu ubicación",
                ) {
                    Icon(Icons.Default.MyLocation, contentDescription = null, tint = MapsBlue)
                }
            }
        }

        NavBottomTripBar(
            etaMinutes = navEtaMinutes,
            routeKm = navRouteKm,
            parada = stop.parada,
            cliente = stop.cliente,
            onExit = onBack,
            onLlegue = onLlegue,
            navLoading = navLoading,
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .bravaSafeBottom(),
        )
    }
}

@Composable
private fun NavTopInstructionBanner(
    primary: String,
    thenInstruction: String?,
    modifier: String?,
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
                        MapsBanner,
                        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                    )
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (loading) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(36.dp),
                )
            } else {
                Icon(
                    imageVector = maneuverIcon(modifier),
                    contentDescription = null,
                    tint = Color.White,
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
                            MapsBannerThen,
                            RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp),
                        )
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Luego",
                    color = Color.White.copy(alpha = 0.85f),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                )
                Icon(
                    Icons.Default.TurnLeft,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(22.dp).padding(horizontal = 6.dp),
                )
                Text(
                    thenInstruction,
                    color = Color.White,
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
                            MapsBannerThen,
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
                .background(Color.White),
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
                color = Color(0xFF5F6368),
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
    content: @Composable () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .size(46.dp)
                .shadow(4.dp, CircleShape)
                .clip(CircleShape)
                .background(Color.White)
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
    etaMinutes: Int?,
    routeKm: Double?,
    parada: Int?,
    cliente: String?,
    onExit: () -> Unit,
    onLlegue: () -> Unit,
    navLoading: Boolean,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        color = Color.White,
        shadowElevation = 12.dp,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 12.dp),
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
                            .background(Color(0xFFF1F3F4), CircleShape),
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Salir", tint = Color(0xFF3C4043))
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
                            routeKm?.let { add(String.format(Locale.US, "%.1f km", it)) }
                            parada?.let { add("Parada $it") }
                            cliente?.trim()?.takeIf { it.isNotEmpty() }?.let { add(it) }
                        }.joinToString(" · ")
                    if (sub.isNotBlank()) {
                        Text(
                            sub,
                            color = Color(0xFF5F6368),
                            fontSize = 13.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                IconButton(
                    onClick = onLlegue,
                    enabled = !navLoading,
                    modifier =
                        Modifier
                            .size(44.dp)
                            .background(BravaOrange.copy(alpha = 0.15f), CircleShape),
                ) {
                    Icon(Icons.Default.Navigation, contentDescription = "Llegué", tint = BravaOrange)
                }
            }
            Button(
                onClick = onLlegue,
                enabled = !navLoading,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 16.dp, end = 16.dp, top = 10.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BravaOrange),
            ) {
                Text("Llegué · Parada ${parada ?: "?"}", fontWeight = FontWeight.Bold)
            }
        }
    }
}

private fun maneuverIcon(modifier: String?): ImageVector {
    val m = modifier.orEmpty().lowercase()
    return when {
        m.contains("uturn") -> Icons.Default.TurnLeft
        m.contains("left") -> Icons.Default.TurnLeft
        m.contains("right") -> Icons.Default.TurnRight
        else -> Icons.Default.Navigation
    }
}
