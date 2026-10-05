package app.bravaburgers.repartidor.nativeapp.mapbox

import android.graphics.Color
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.mapbox.navigation.base.formatter.DistanceFormatterOptions
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineOptions
import com.mapbox.navigation.ui.maps.route.line.model.RouteLineColorResources
import com.mapbox.navigation.ui.maps.route.line.model.RouteLineResources
import java.util.Locale

object BravaMapboxDropInUi {
    private val routeOrange = Color.parseColor("#FF6B35")
    private val routeCasing = Color.parseColor("#CC4A1F")

    fun applyBravaOptions(navigationView: NavigationView) {
        val ctx = navigationView.context
        val bravaRouteLineOptions =
            MapboxRouteLineOptions.Builder(ctx)
                .withRouteLineResources(
                    RouteLineResources.Builder()
                        .routeLineColorResources(
                            RouteLineColorResources.Builder()
                                .routeDefaultColor(routeOrange)
                                .routeLowCongestionColor(routeOrange)
                                .routeModerateCongestionColor(routeOrange)
                                .routeHeavyCongestionColor(routeOrange)
                                .routeSevereCongestionColor(routeOrange)
                                .routeUnknownCongestionColor(routeOrange)
                                .routeCasingColor(routeCasing)
                                .build(),
                        )
                        .build(),
                )
                .build()
        navigationView.customizeViewOptions {
            infoPanelForcedState = BottomSheetBehavior.STATE_HIDDEN
            isInfoPanelHideable = true
            showArrivalText = false
            showPoiName = false
            showInfoPanelInFreeDrive = false
            showTripProgress = false
            showRoadName = false
            showSpeedLimit = false
            showEndNavigationButton = false
            showManeuver = false
            showCameraModeActionButton = false
            showActionButtons = false
            showCompassActionButton = false
            showToggleAudioActionButton = false
            showRecenterActionButton = false
            routeLineOptions = bravaRouteLineOptions
            distanceFormatterOptions =
                DistanceFormatterOptions.Builder(ctx)
                    .locale(Locale("es", "AR"))
                    .build()
        }
    }
}
