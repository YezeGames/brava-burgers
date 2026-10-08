package app.bravaburgers.repartidor.nativeapp.ui

import androidx.compose.foundation.Image
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

@Composable
fun BravaRidersLogo(
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
    cornerRadius: Dp = 10.dp,
) {
    Image(
        painter = painterResource(R.drawable.brava_login_logo),
        contentDescription = "Brava Burgers",
        modifier =
            modifier
                .size(size)
                .clip(RoundedCornerShape(cornerRadius)),
        contentScale = ContentScale.Crop,
    )
}

/** Logo login: la imagen ya trae marco naranja; llena el cuadrado con sombra. */
@Composable
fun BravaRidersLogoHero(
    modifier: Modifier = Modifier,
    size: Dp = 120.dp,
) {
    val shape = RoundedCornerShape(24.dp)
    Image(
        painter = painterResource(R.drawable.brava_login_logo),
        contentDescription = "Brava Burgers",
        modifier =
            modifier
                .size(size)
                .shadow(
                    elevation = 8.dp,
                    shape = shape,
                    spotColor = Color(0x59FF6B35),
                    ambientColor = Color(0x33FF6B35),
                )
                .clip(shape),
        contentScale = ContentScale.Crop,
    )
}
