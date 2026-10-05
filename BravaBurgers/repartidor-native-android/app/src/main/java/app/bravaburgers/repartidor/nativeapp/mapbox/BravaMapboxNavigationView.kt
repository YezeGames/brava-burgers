package app.bravaburgers.repartidor.nativeapp.mapbox

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import app.bravaburgers.repartidor.nativeapp.BuildConfig
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.dropin.NavigationView

/** Drop-in Mapbox Navigation (mapa + puck + cámara + guidance). */
@Composable
fun BravaMapboxNavigationView(
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val accessToken = BuildConfig.MAPBOX_ACCESS_TOKEN

    val navigationView =
        remember(accessToken) {
            NavigationView(context, accessToken = accessToken)
        }

    DisposableEffect(lifecycleOwner) {
        BravaMapboxNavigation.ensureRegistered()
        MapboxNavigationApp.attach(lifecycleOwner)

        onDispose {
            MapboxNavigationApp.detach(lifecycleOwner)
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { navigationView },
    )
}
