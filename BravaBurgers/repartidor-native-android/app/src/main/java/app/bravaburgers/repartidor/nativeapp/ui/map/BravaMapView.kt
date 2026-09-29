package app.bravaburgers.repartidor.nativeapp.ui.map

import android.view.ViewGroup
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.bravaburgers.repartidor.nativeapp.BuildConfig
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point

private const val ROUTE_SOURCE = "brava-route-source"
private const val ROUTE_LAYER = "brava-route-layer"
private const val DEST_SOURCE = "brava-dest-source"
private const val DEST_LAYER = "brava-dest-layer"

@Composable
fun BravaMapView(
    modifier: Modifier = Modifier,
    route: List<Pair<Double, Double>>,
    destination: Pair<Double, Double>?,
    recenterKey: Int = 0,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val mapView =
        remember {
            MapView(context).apply {
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
            }
        }
    var mapRef by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleReady by remember { mutableStateOf(false) }

    DisposableEffect(lifecycleOwner, mapView) {
        mapView.onCreate(null)
        val observer =
            LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_START -> mapView.onStart()
                    Lifecycle.Event.ON_RESUME -> mapView.onResume()
                    Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                    Lifecycle.Event.ON_STOP -> mapView.onStop()
                    else -> {}
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
        }
    }

    LaunchedEffect(mapView) {
        mapView.getMapAsync { map ->
            mapRef = map
            map.setStyle(Style.Builder().fromUri(BuildConfig.MAP_STYLE)) { style ->
                styleReady = true
                applyRoute(style, route, destination)
                safeFitCamera(map, route, destination)
            }
        }
    }

    LaunchedEffect(route, destination, recenterKey, styleReady) {
        if (!styleReady) return@LaunchedEffect
        val map = mapRef ?: return@LaunchedEffect
        val style = map.style ?: return@LaunchedEffect
        applyRoute(style, route, destination)
        safeFitCamera(map, route, destination)
    }

    AndroidView(modifier = modifier, factory = { mapView })
}

private fun applyRoute(
    style: Style,
    route: List<Pair<Double, Double>>,
    destination: Pair<Double, Double>?,
) {
    listOf(ROUTE_LAYER, DEST_LAYER).forEach { id ->
        if (style.getLayer(id) != null) style.removeLayer(id)
    }
    listOf(ROUTE_SOURCE, DEST_SOURCE).forEach { id ->
        if (style.getSource(id) != null) style.removeSource(id)
    }

    if (route.size >= 2) {
        val points = route.map { (lat, lng) -> Point.fromLngLat(lng, lat) }
        val line = LineString.fromLngLats(points)
        style.addSource(GeoJsonSource(ROUTE_SOURCE, Feature.fromGeometry(line)))
        style.addLayer(
            LineLayer(ROUTE_LAYER, ROUTE_SOURCE).withProperties(
                PropertyFactory.lineColor("#FF6B35"),
                PropertyFactory.lineWidth(5f),
                PropertyFactory.lineOpacity(0.9f),
            ),
        )
    }

    destination?.let { (lat, lng) ->
        val point = Point.fromLngLat(lng, lat)
        style.addSource(GeoJsonSource(DEST_SOURCE, Feature.fromGeometry(point)))
        style.addLayer(
            CircleLayer(DEST_LAYER, DEST_SOURCE).withProperties(
                PropertyFactory.circleRadius(8f),
                PropertyFactory.circleColor("#29B6F6"),
                PropertyFactory.circleStrokeWidth(2f),
                PropertyFactory.circleStrokeColor("#FFFFFF"),
            ),
        )
    }
}

/** MapLibre crashea si newLatLngBounds tiene un solo punto o bounds degenerados. */
private fun safeFitCamera(
    map: MapLibreMap,
    route: List<Pair<Double, Double>>,
    destination: Pair<Double, Double>?,
) {
    val points = ArrayList<LatLng>()
    route.forEach { (lat, lng) -> points.add(LatLng(lat, lng)) }
    destination?.let { (lat, lng) -> points.add(LatLng(lat, lng)) }

    when {
        points.isEmpty() -> {
            map.moveCamera(
                CameraUpdateFactory.newLatLngZoom(LatLng(-34.50695, -58.49435), 13.0),
            )
        }
        points.size == 1 -> {
            map.animateCamera(CameraUpdateFactory.newLatLngZoom(points[0], 15.0))
        }
        else -> {
            val builder = LatLngBounds.Builder()
            points.forEach { builder.include(it) }
            try {
                map.animateCamera(CameraUpdateFactory.newLatLngBounds(builder.build(), 100))
            } catch (_: Throwable) {
                map.animateCamera(CameraUpdateFactory.newLatLngZoom(points.last(), 14.0))
            }
        }
    }
}
