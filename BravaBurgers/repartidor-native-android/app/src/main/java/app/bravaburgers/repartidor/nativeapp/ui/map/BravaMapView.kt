package app.bravaburgers.repartidor.nativeapp.ui.map

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.ViewGroup
import androidx.appcompat.content.res.AppCompatResources
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.bravaburgers.repartidor.nativeapp.BuildConfig
import app.bravaburgers.repartidor.nativeapp.R
import app.bravaburgers.repartidor.nativeapp.navigation.NavRouteProgress
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point

private const val ROUTE_SOURCE = "brava-route-source"
private const val ROUTE_LAYER = "brava-route-layer"
private const val DEST_SOURCE = "brava-dest-source"
private const val DEST_LAYER = "brava-dest-layer"
private const val DRIVER_SOURCE = "brava-driver-source"
private const val DRIVER_LAYER = "brava-driver-layer"
private const val NAV_PUCK_IMAGE = "brava-nav-puck"

private const val NAV_ZOOM = 17.4
private const val NAV_PITCH = 60.0
private const val NAV_ANIM_MS = 180

@Composable
fun BravaMapView(
    modifier: Modifier = Modifier,
    route: List<Pair<Double, Double>>,
    destination: Pair<Double, Double>?,
    driver: Pair<Double, Double>? = null,
    recenterKey: Int = 0,
    compassResetKey: Int = 0,
    navigationFollow: Boolean = false,
    driverBearing: Float? = null,
    navigationMode: Boolean = false,
    onUserMovedMap: () -> Unit = {},
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val topPadPx = with(density) { if (navigationMode) 132.dp.toPx().toInt() else 0 }
    val bottomPadPx = with(density) { if (navigationMode) 112.dp.toPx().toInt() else 0 }
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
    var didOverview by remember { mutableStateOf(false) }
    var gestureBound by remember { mutableStateOf(false) }

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
                ensureNavPuckImage(context, style)
                styleReady = true
                applyRouteGeometry(style, route, destination, navigationMode)
                updateDriverMarker(style, driver, driverBearing, navigationMode)
                safeFitCamera(map, route, destination, driver)
            }
        }
    }

    LaunchedEffect(mapRef, styleReady, gestureBound, onUserMovedMap) {
        val map = mapRef ?: return@LaunchedEffect
        if (!styleReady || gestureBound) return@LaunchedEffect
        gestureBound = true
        map.addOnCameraMoveStartedListener { reason ->
            if (reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE) {
                onUserMovedMap()
            }
        }
    }

    LaunchedEffect(route, destination, styleReady, navigationMode) {
        if (!styleReady) return@LaunchedEffect
        val style = mapRef?.style ?: return@LaunchedEffect
        applyRouteGeometry(style, route, destination, navigationMode)
    }

    LaunchedEffect(driver, driverBearing, styleReady, navigationMode) {
        if (!styleReady) return@LaunchedEffect
        val style = mapRef?.style ?: return@LaunchedEffect
        updateDriverMarker(style, driver, driverBearing, navigationMode)
    }

    LaunchedEffect(
        driver,
        destination,
        recenterKey,
        styleReady,
        navigationFollow,
        driverBearing,
        route,
        navigationMode,
        topPadPx,
        bottomPadPx,
    ) {
        if (!styleReady) return@LaunchedEffect
        val map = mapRef ?: return@LaunchedEffect
        map.setPadding(0, topPadPx, 0, bottomPadPx)
        if (navigationFollow && driver != null && route.size >= 2) {
            map.uiSettings.isRotateGesturesEnabled = true
            map.uiSettings.isTiltGesturesEnabled = true
            val along = NavRouteProgress.distanceAlongRouteM(driver.first, driver.second, route)
            val brg =
                driverBearing?.toDouble()
                    ?: NavRouteProgress.travelBearingDeg(route, along)
                    ?: 0.0
            val pos =
                CameraPosition.Builder()
                    .target(LatLng(driver.first, driver.second))
                    .zoom(NAV_ZOOM)
                    .tilt(NAV_PITCH)
                    .bearing(brg)
                    .build()
            map.animateCamera(CameraUpdateFactory.newCameraPosition(pos), NAV_ANIM_MS)
        } else if (!navigationFollow && !didOverview && route.size >= 2 && !navigationMode) {
            safeFitCamera(map, route, destination, driver)
            didOverview = true
        } else if (!navigationFollow && !navigationMode) {
            safeFitCamera(map, route, destination, driver)
        }
    }

    LaunchedEffect(compassResetKey, styleReady, driver) {
        if (!styleReady || compassResetKey == 0) return@LaunchedEffect
        val map = mapRef ?: return@LaunchedEffect
        val target = driver?.let { LatLng(it.first, it.second) } ?: map.cameraPosition.target
        val pos =
            CameraPosition.Builder()
                .target(target)
                .zoom(map.cameraPosition.zoom)
                .tilt(0.0)
                .bearing(0.0)
                .build()
        map.animateCamera(CameraUpdateFactory.newCameraPosition(pos), 280)
    }

    LaunchedEffect(recenterKey, navigationFollow) {
        if (recenterKey > 0 && navigationFollow) {
            didOverview = false
        }
    }

    LaunchedEffect(navigationFollow) {
        if (!navigationFollow) {
            didOverview = false
        }
    }

    AndroidView(modifier = modifier, factory = { mapView })
}

private fun ensureNavPuckImage(context: Context, style: Style) {
    if (style.getImage(NAV_PUCK_IMAGE) != null) return
    val dr =
        AppCompatResources.getDrawable(context, R.drawable.ic_nav_puck) ?: return
    val size = 96
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    dr.setBounds(0, 0, size, size)
    dr.draw(canvas)
    style.addImage(NAV_PUCK_IMAGE, bitmap)
}

private fun applyRouteGeometry(
    style: Style,
    route: List<Pair<Double, Double>>,
    destination: Pair<Double, Double>?,
    navigationMode: Boolean,
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
        val lineColor = if (navigationMode) "#4285F4" else "#FF6B35"
        style.addLayer(
            LineLayer(ROUTE_LAYER, ROUTE_SOURCE).withProperties(
                PropertyFactory.lineColor(lineColor),
                PropertyFactory.lineWidth(if (navigationMode) 7f else 5f),
                PropertyFactory.lineOpacity(0.92f),
            ),
        )
    }

    destination?.let { (lat, lng) ->
        val point = Point.fromLngLat(lng, lat)
        style.addSource(GeoJsonSource(DEST_SOURCE, Feature.fromGeometry(point)))
        style.addLayer(
            CircleLayer(DEST_LAYER, DEST_SOURCE).withProperties(
                PropertyFactory.circleRadius(10f),
                PropertyFactory.circleColor("#EA4335"),
                PropertyFactory.circleStrokeWidth(3f),
                PropertyFactory.circleStrokeColor("#FFFFFF"),
            ),
        )
    }
}

private fun updateDriverMarker(
    style: Style,
    driver: Pair<Double, Double>?,
    bearing: Float?,
    navigationMode: Boolean,
) {
    if (style.getLayer(DRIVER_LAYER) != null) style.removeLayer(DRIVER_LAYER)
    if (style.getSource(DRIVER_SOURCE) != null) style.removeSource(DRIVER_SOURCE)
    if (driver == null) return

    val point = Point.fromLngLat(driver.second, driver.first)
    val brg = bearing?.toDouble() ?: 0.0
    val feature =
        Feature.fromGeometry(point).apply {
            addNumberProperty("bearing", brg)
        }
    style.addSource(GeoJsonSource(DRIVER_SOURCE, feature))

    if (navigationMode) {
        style.addLayer(
            SymbolLayer(DRIVER_LAYER, DRIVER_SOURCE).withProperties(
                PropertyFactory.iconImage(NAV_PUCK_IMAGE),
                PropertyFactory.iconSize(0.85f),
                PropertyFactory.iconAllowOverlap(true),
                PropertyFactory.iconIgnorePlacement(true),
                PropertyFactory.iconAnchor("center"),
                PropertyFactory.iconRotate(Expression.get("bearing")),
            ),
        )
    } else {
        style.addLayer(
            CircleLayer(DRIVER_LAYER, DRIVER_SOURCE).withProperties(
                PropertyFactory.circleRadius(11f),
                PropertyFactory.circleColor("#29B6F6"),
                PropertyFactory.circleStrokeWidth(3f),
                PropertyFactory.circleStrokeColor("#FFFFFF"),
            ),
        )
    }
}

private fun safeFitCamera(
    map: MapLibreMap,
    route: List<Pair<Double, Double>>,
    destination: Pair<Double, Double>?,
    driver: Pair<Double, Double>?,
) {
    val points = ArrayList<LatLng>()
    route.forEach { (lat, lng) -> points.add(LatLng(lat, lng)) }
    destination?.let { (lat, lng) -> points.add(LatLng(lat, lng)) }
    driver?.let { (lat, lng) -> points.add(LatLng(lat, lng)) }

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
