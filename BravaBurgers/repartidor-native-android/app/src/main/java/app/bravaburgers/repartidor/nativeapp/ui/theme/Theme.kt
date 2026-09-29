package app.bravaburgers.repartidor.nativeapp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val BravaOrange = Color(0xFFFF6B35)
val BgDark = Color(0xFF0B141A)
val SurfaceDark = Color(0xFF152028)
val LineDark = Color(0xFF243038)
val TextPrimary = Color(0xFFE8EEF2)
val TextMuted = Color(0xFF8FA3B0)
val OkGreen = Color(0xFF43A047)
val EfYellow = Color(0xFFFFB300)
val MpBlue = Color(0xFF29B6F6)

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
