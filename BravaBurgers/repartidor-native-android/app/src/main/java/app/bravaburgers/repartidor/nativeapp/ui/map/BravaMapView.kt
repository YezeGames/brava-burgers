package app.bravaburgers.repartidor.nativeapp.ui.map

import android.view.ViewGroup
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import app.bravaburgers.repartidor.nativeapp.BuildConfig
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.geojson.Feature
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource

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
    val mapView = remember {
        MapView(context).apply {
            layoutParams =
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
        }
    }

    DisposableEffect(mapView) {
        mapView.onCreate(null)
        mapView.onStart()
        mapView.onResume()
        onDispose {
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
        }
    }

    LaunchedEffect(route, destination, recenterKey) {
        mapView.getMapAsync { map ->
            map.setStyle(Style.Builder().fromUri(BuildConfig.MAP_STYLE)) { style ->
                applyRoute(style, route, destination)
                fitCamera(map, route, destination)
            }
        }
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

private fun fitCamera(
    map: org.maplibre.android.maps.MapLibreMap,
    route: List<Pair<Double, Double>>,
    destination: Pair<Double, Double>?,
) {
    val boundsBuilder = LatLngBounds.Builder()
    var count = 0
    route.forEach { (lat, lng) ->
        boundsBuilder.include(LatLng(lat, lng))
        count++
    }
    destination?.let { (lat, lng) ->
        boundsBuilder.include(LatLng(lat, lng))
        count++
    }
    if (count == 0) {
        map.cameraPosition =
            CameraPosition.Builder().target(LatLng(-34.50695, -58.49435)).zoom(13.0).build()
        return
    }
    val padding = 100
    map.animateCamera(CameraUpdateFactory.newLatLngBounds(boundsBuilder.build(), padding))
}
