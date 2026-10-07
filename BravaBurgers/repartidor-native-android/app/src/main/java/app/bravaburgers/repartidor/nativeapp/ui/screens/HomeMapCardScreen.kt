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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.Style
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

private const val PREVIEW_ZOOM = 16.5

@Composable
fun HomeMapCardScreen(
    driver: Pair<Double, Double>?,
    waitingGps: Boolean,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val mapViewHolder = remember { MapViewHolder() }

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

    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .clip(RoundedCornerShape(16.dp))
                .border(1.dp, LineDark, RoundedCornerShape(16.dp))
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
                        mv.getMapboxMap().loadStyleUri(Style.MAPBOX_STREETS) {
                            driver?.let { (lat, lng) ->
                                mv.getMapboxMap().setCamera(
                                    CameraOptions.Builder()
                                        .center(Point.fromLngLat(lng, lat))
                                        .zoom(PREVIEW_ZOOM)
                                        .pitch(0.0)
                                        .bearing(0.0)
                                        .build(),
                                )
                            }
                        }
                    }
                },
                update = { mv ->
                    val (lat, lng) = driver ?: return@AndroidView
                    mv.getMapboxMap().setCamera(
                        CameraOptions.Builder()
                            .center(Point.fromLngLat(lng, lat))
                            .zoom(PREVIEW_ZOOM)
                            .pitch(0.0)
                            .build(),
                    )
                },
            )
            FloatingActionButton(
                onClick = {
                    val (lat, lng) = driver ?: return@FloatingActionButton
                    mapViewHolder.mapView?.getMapboxMap()?.setCamera(
                        CameraOptions.Builder()
                            .center(Point.fromLngLat(lng, lat))
                            .zoom(PREVIEW_ZOOM)
                            .pitch(0.0)
                            .build(),
                    )
                },
                modifier = Modifier.align(Alignment.BottomEnd).padding(14.dp),
                containerColor = BravaOrange,
            ) {
                Icon(Icons.Default.MyLocation, contentDescription = "Recentrar", tint = TextPrimary)
            }
        }
    }
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
