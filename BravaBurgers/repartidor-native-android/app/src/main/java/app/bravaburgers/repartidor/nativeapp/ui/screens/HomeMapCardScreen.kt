package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.maps.plugin.scalebar.scalebar
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

private const val PREVIEW_ZOOM = 16.5
private const val MAPBOX_DARK = "mapbox://styles/mapbox/dark-v11"

@Composable
fun HomeMapCardScreen(
    driver: Pair<Double, Double>?,
    waitingGps: Boolean,
    modifier: Modifier = Modifier,
) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val mapViewHolder = remember { MapViewHolder() }
    val locationProvider = remember { PreviewMapLocationProvider() }

    DisposableEffect(lifecycle) {
        val observer =
            LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_START -> mapViewHolder.mapView?.onStart()
                    Lifecycle.Event.ON_STOP -> mapViewHolder.mapView?.onStop()
                    Lifecycle.Event.ON_DESTROY -> mapViewHolder.destroy()
                    else -> Unit
                }
            }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            mapViewHolder.destroy()
        }
    }

    val gpsReady = driver != null
    val pillLabel =
        when {
            waitingGps && !gpsReady -> "Buscando GPS…"
            gpsReady -> "GPS en vivo"
            else -> "Sin señal GPS"
        }

    Box(
        modifier =
            modifier
                .fillMaxSize()
                .background(SurfaceDark),
    ) {
        if (driver == null && waitingGps) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                ColumnLoadingGps()
            }
        } else {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    MapView(ctx).also { mv ->
                        mapViewHolder.bind(mv)
                        mv.scalebar.enabled = false
                        mv.location.setLocationProvider(locationProvider)
                        mv.location.updateSettings {
                            enabled = true
                            pulsingEnabled = true
                        }
                        mv.getMapboxMap().loadStyleUri(MAPBOX_DARK) {
                            driver?.let { (lat, lng) ->
                                locationProvider.push(lat, lng)
                                centerCamera(mv, lat, lng)
                            }
                        }
                    }
                },
                update = { mv ->
                    val (lat, lng) = driver ?: return@AndroidView
                    locationProvider.push(lat, lng)
                    centerCamera(mv, lat, lng)
                },
            )
            Text(
                pillLabel,
                color = TextPrimary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier =
                    Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 14.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(TextPrimary.copy(alpha = 0.12f))
                        .border(1.dp, LineDark, RoundedCornerShape(20.dp))
                        .padding(horizontal = 14.dp, vertical = 8.dp),
            )
            FloatingActionButton(
                onClick = {
                    val (lat, lng) = driver ?: return@FloatingActionButton
                    mapViewHolder.mapView?.let { centerCamera(it, lat, lng) }
                },
                modifier = Modifier.align(Alignment.BottomEnd).padding(18.dp),
                containerColor = BravaOrange,
            ) {
                Icon(Icons.Default.MyLocation, contentDescription = "Recentrar", tint = TextPrimary)
            }
        }
    }
}

private fun centerCamera(mv: MapView, lat: Double, lng: Double) {
    mv.getMapboxMap().setCamera(
        CameraOptions.Builder()
            .center(Point.fromLngLat(lng, lat))
            .zoom(PREVIEW_ZOOM)
            .pitch(0.0)
            .bearing(0.0)
            .build(),
    )
}

@Composable
private fun ColumnLoadingGps() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(color = BravaOrange, strokeWidth = 2.dp)
        Text(
            "Obteniendo GPS…",
            color = TextMuted,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 12.dp, start = 24.dp, end = 24.dp),
        )
    }
}

private class MapViewHolder {
    var mapView: MapView? = null

    fun bind(mv: MapView) {
        mapView = mv
    }

    fun destroy() {
        mapView?.onDestroy()
        mapView = null
    }
}

/** Ubicación del repartidor en el mapa preview (puck azul Mapbox). */
private class PreviewMapLocationProvider : com.mapbox.maps.plugin.locationcomponent.LocationProvider {
    private val consumers =
        mutableSetOf<com.mapbox.maps.plugin.locationcomponent.LocationConsumer>()

    fun push(lat: Double, lng: Double) {
        if (!lat.isFinite() || !lng.isFinite() || (lat == 0.0 && lng == 0.0)) return
        val point = Point.fromLngLat(lng, lat)
        consumers.forEach { it.onLocationUpdated(point) { } }
    }

    override fun registerLocationConsumer(consumer: com.mapbox.maps.plugin.locationcomponent.LocationConsumer) {
        consumers.add(consumer)
    }

    override fun unRegisterLocationConsumer(consumer: com.mapbox.maps.plugin.locationcomponent.LocationConsumer) {
        consumers.remove(consumer)
    }
}
