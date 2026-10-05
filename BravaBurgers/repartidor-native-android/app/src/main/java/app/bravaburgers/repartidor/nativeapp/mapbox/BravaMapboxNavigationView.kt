package app.bravaburgers.repartidor.nativeapp.mapbox

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import app.bravaburgers.repartidor.nativeapp.BuildConfig
import app.bravaburgers.repartidor.nativeapp.ui.theme.BgDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import com.mapbox.navigation.dropin.NavigationView

/** Drop-in Mapbox Navigation (mapa + puck + cámara + guidance). */
@Composable
fun BravaMapboxNavigationView(
    modifier: Modifier = Modifier,
) {
    val token = BuildConfig.MAPBOX_ACCESS_TOKEN.trim()
    if (token.isBlank()) {
        Box(
            modifier = modifier.fillMaxSize().background(BgDark),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "Mapbox no está configurado en esta APK.\nRecompilá con MAPBOX_ACCESS_TOKEN en local.properties.",
                color = TextMuted,
                modifier = Modifier.padding(24.dp),
            )
        }
        return
    }
    if (!com.mapbox.navigation.core.lifecycle.MapboxNavigationApp.isSetup()) {
        Box(
            modifier = modifier.fillMaxSize().background(BgDark),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "Mapbox Navigation no inició.\nReinstalá la app o contactá soporte.",
                color = TextMuted,
                modifier = Modifier.padding(24.dp),
            )
        }
        return
    }

    val viewModelStoreOwner = LocalViewModelStoreOwner.current
    if (viewModelStoreOwner == null) {
        Box(
            modifier = modifier.fillMaxSize().background(BgDark),
            contentAlignment = Alignment.Center,
        ) {
            Text("No se pudo abrir el mapa (Activity).", color = TextMuted)
        }
        return
    }

    DisposableEffect(Unit) {
        BravaMapboxNavigation.ensureRegistered()
        onDispose { }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            NavigationView(
                context = ctx,
                accessToken = token,
                viewModelStoreOwner = viewModelStoreOwner,
            )
        },
    )
}
