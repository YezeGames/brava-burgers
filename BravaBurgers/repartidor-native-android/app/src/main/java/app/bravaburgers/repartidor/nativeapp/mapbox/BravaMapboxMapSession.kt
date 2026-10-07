package app.bravaburgers.repartidor.nativeapp.mapbox

import android.content.Context
import android.graphics.Color
import android.location.Location
import com.mapbox.maps.MapView
import com.mapbox.maps.Style
import com.mapbox.maps.plugin.compass.compass
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.trip.model.RouteProgress
import com.mapbox.navigation.ui.maps.NavigationStyles
import com.mapbox.navigation.ui.maps.location.NavigationLocationProvider
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineApi
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineView
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineOptions
import com.mapbox.navigation.ui.maps.route.line.model.RouteLineColorResources
import com.mapbox.navigation.ui.maps.route.line.model.RouteLineResources
import com.mapbox.navigation.ui.voice.api.MapboxSpeechApi
import com.mapbox.navigation.ui.voice.api.MapboxVoiceInstructionsPlayer
import com.mapbox.navigation.ui.voice.model.SpeechVolume
import app.bravaburgers.repartidor.nativeapp.BuildConfig

/**
 * Mapa nativo [MapView]: estilo nav, puck (enhanced location) y línea de ruta Brava.
 */
object BravaMapboxMapSession {
    private const val ROUTE_BELOW_LAYER = "mapbox-location-indicator-layer"
    private val routeOrange = Color.parseColor("#FF6B35")
    private val routeCasing = Color.parseColor("#CC4A1F")

    private var mapView: MapView? = null
    private var mapStyle: Style? = null
    private var styleReady = false
    private var pendingRoutes: List<NavigationRoute>? = null

    private val navigationLocationProvider = NavigationLocationProvider()
    private var routeLineApi: MapboxRouteLineApi? = null
    private var routeLineView: MapboxRouteLineView? = null

    private var speechApi: MapboxSpeechApi? = null
    private var voicePlayer: MapboxVoiceInstructionsPlayer? = null
    private var voiceMuted = false

    fun attach(
        mapView: MapView,
        context: Context,
        onStyleReady: (() -> Unit)? = null,
    ) {
        if (this.mapView === mapView && styleReady) return
        this.mapView = mapView
        styleReady = false
        mapView.compass.enabled = false

        val routeOpts = buildRouteLineOptions(context)
        routeLineApi = MapboxRouteLineApi(routeOpts)
        routeLineView = MapboxRouteLineView(routeOpts)

        val language = BravaMapboxLocale.NAV_LANGUAGE
        val token = BuildConfig.MAPBOX_ACCESS_TOKEN
        speechApi = MapboxSpeechApi(context, token, language)
        voicePlayer = MapboxVoiceInstructionsPlayer(context, token, language)

        mapView.getMapboxMap().loadStyleUri(NavigationStyles.NAVIGATION_NIGHT_STYLE) { style ->
            mapStyle = style
            styleReady = true
            mapView.location.setLocationProvider(navigationLocationProvider)
            mapView.location.updateSettings {
                enabled = true
                pulsingEnabled = false
            }
            pendingRoutes?.let { drawRoutes(it) }
            pendingRoutes = null
            BravaMapboxCameraAnchor.onMapViewAttached(mapView)
            BravaMapboxNavigation.notifyMapSurfaceReady()
            onStyleReady?.invoke()
        }
    }

    fun isMapReady(): Boolean = styleReady && mapView != null

    fun updateEnhancedLocation(
        location: Location,
        keyPoints: List<Location> = emptyList(),
    ) {
        navigationLocationProvider.changePosition(location, keyPoints)
    }

    fun drawRoutes(routes: List<NavigationRoute>) {
        val api = routeLineApi
        val view = routeLineView
        val style = mapStyle
        if (!styleReady || api == null || view == null || style == null) {
            pendingRoutes = routes
            return
        }
        api.setNavigationRoutes(routes) { value ->
            view.renderRouteDrawData(style, value)
        }
    }

    fun clearRoutes() {
        val api = routeLineApi
        val view = routeLineView
        val style = mapStyle
        pendingRoutes = null
        if (api == null || view == null || style == null) return
        api.setNavigationRoutes(emptyList()) { value ->
            view.renderRouteDrawData(style, value)
        }
    }

    fun updateRouteProgress(routeProgress: RouteProgress) {
        val api = routeLineApi
        val view = routeLineView
        val style = mapStyle ?: return
        if (api == null || view == null) return
        api.updateWithRouteProgress(routeProgress) { result ->
            view.renderRouteLineUpdate(style, result)
        }
    }

    fun toggleVoiceMute(): Boolean {
        voiceMuted = !voiceMuted
        voicePlayer?.volume(SpeechVolume(if (voiceMuted) 0f else 1f))
        return voiceMuted
    }

    fun isVoiceMuted(): Boolean = voiceMuted

    fun speechApiOrNull(): MapboxSpeechApi? = speechApi

    fun voicePlayerOrNull(): MapboxVoiceInstructionsPlayer? = voicePlayer

    fun reset() {
        routeLineApi?.cancel()
        routeLineView?.cancel()
        voicePlayer?.shutdown()
        mapView = null
        mapStyle = null
        styleReady = false
        pendingRoutes = null
        routeLineApi = null
        routeLineView = null
        speechApi = null
        voicePlayer = null
    }

    private fun buildRouteLineOptions(context: Context): MapboxRouteLineOptions =
        MapboxRouteLineOptions
            .Builder(context)
            .withRouteLineBelowLayerId(ROUTE_BELOW_LAYER)
            .withRouteLineResources(
                RouteLineResources
                    .Builder()
                    .routeLineColorResources(
                        RouteLineColorResources
                            .Builder()
                            .routeDefaultColor(routeOrange)
                            .routeLowCongestionColor(routeOrange)
                            .routeModerateCongestionColor(routeOrange)
                            .routeHeavyCongestionColor(routeOrange)
                            .routeSevereCongestionColor(routeOrange)
                            .routeUnknownCongestionColor(routeOrange)
                            .routeCasingColor(routeCasing)
                            .build(),
                    ).build(),
            ).build()
}
