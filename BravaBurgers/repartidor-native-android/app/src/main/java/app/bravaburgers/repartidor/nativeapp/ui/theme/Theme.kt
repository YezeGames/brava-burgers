package app.bravaburgers.repartidor.nativeapp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Paleta Brava Repartidor (spec UI 2025). */
val BravaOrange = Color(0xFFFF5722)
val BgDark = Color(0xFF12171E)
val SurfaceDark = Color(0xFF1E232A)
val LineDark = Color(0xFF2D343F)
val TextPrimary = Color(0xFFFFFFFF)
val TextMuted = Color(0xFFA0A0A0)
val OkGreen = Color(0xFF4CAF50)
val EfYellow = Color(0xFFD4A359)
val EfBadgeBg = Color(0xFF3A3223)
val MpBlue = Color(0xFF00A8E8)
val MpBadgeBg = Color(0xFF1C384A)

private val scheme =
    darkColorScheme(
        primary = BravaOrange,
        onPrimary = Color.White,
        background = BgDark,
        surface = SurfaceDark,
        onBackground = TextPrimary,
        onSurface = TextPrimary,
        outline = LineDark,
    )

@Composable
fun BravaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}
