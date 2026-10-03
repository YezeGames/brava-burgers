package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.bravaburgers.repartidor.nativeapp.ui.BravaRidersLogo
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeScreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted

/** Misma “pantalla de entrada” que login, pero solo OTA (sin credenciales). */
@Composable
fun AppUpdateGateScreen(
    statusLine: String,
    showSpinner: Boolean = false,
) {
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(BgDark)
                .bravaSafeScreen(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BravaRidersLogo()
            Spacer(modifier = Modifier.height(28.dp))
            if (showSpinner) {
                CircularProgressIndicator(color = BravaOrange)
                Spacer(modifier = Modifier.height(16.dp))
            }
            Text(
                text = statusLine,
                color = TextMuted,
                modifier = Modifier.padding(horizontal = 32.dp),
            )
        }
    }
}
