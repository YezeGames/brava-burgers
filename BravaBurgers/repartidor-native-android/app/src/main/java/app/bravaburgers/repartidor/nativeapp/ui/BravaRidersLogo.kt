package app.bravaburgers.repartidor.nativeapp.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.bravaburgers.repartidor.nativeapp.R

private val LoginOrange = Color(0xFFFF6B35)
private val LoginPageBg = Color(0xFF0D1117)

@Composable
fun BravaRidersLogo(
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
    cornerRadius: Dp = 10.dp,
) {
    Image(
        painter = painterResource(R.drawable.ic_launcher_brava_riders),
        contentDescription = "Brava Riders",
        modifier =
            modifier
                .size(size)
                .clip(RoundedCornerShape(cornerRadius)),
        contentScale = ContentScale.Crop,
    )
}

/** Logo login (spec demo): borde naranja + sombra. */
@Composable
fun BravaRidersLogoHero(
    modifier: Modifier = Modifier,
    size: Dp = 120.dp,
) {
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier =
            modifier
                .size(size)
                .shadow(
                    elevation = 8.dp,
                    shape = shape,
                    spotColor = Color(0x59FF6B35),
                    ambientColor = Color(0x33FF6B35),
                )
                .clip(shape)
                .background(LoginPageBg)
                .border(2.dp, LoginOrange, shape)
                .padding(8.dp),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        Image(
            painter = painterResource(R.drawable.ic_launcher_brava_riders),
            contentDescription = "Brava Riders",
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Fit,
        )
    }
}
