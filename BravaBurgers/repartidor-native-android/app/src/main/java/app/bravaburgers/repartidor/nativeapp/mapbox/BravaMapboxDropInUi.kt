package app.bravaburgers.repartidor.nativeapp.mapbox

import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
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
            showTripProgress = false
            showRoadName = false
            showSpeedLimit = false
            showEndNavigationButton = false
            showManeuver = false
            showCameraModeActionButton = false
            showCompassActionButton = true
            showToggleAudioActionButton = true
            showRecenterActionButton = true
            routeLineOptions = bravaRouteLineOptions
            distanceFormatterOptions =
                DistanceFormatterOptions.Builder(ctx)
                    .locale(Locale("es", "AR"))
                    .build()
        }
    }

    fun wireBravaMapControls(
        navigationView: NavigationView,
        compass: ImageButton,
        volume: ImageButton,
        recenter: ImageButton,
    ) {
        recenter.setOnClickListener { navigationView.api.recenterCamera() }
        navigationView.post {
            val proxies = findMapboxActionProxies(navigationView)
            proxies.compass?.let { hidden ->
                hideMapboxControl(hidden)
                compass.setOnClickListener { hidden.performClick() }
            }
            proxies.audio?.let { hidden ->
                hideMapboxControl(hidden)
                volume.setOnClickListener { hidden.performClick() }
            }
            proxies.recenter?.let { hidden ->
                hideMapboxControl(hidden)
                // recenter ya usa API; proxy por si el botón nativo hace más
                recenter.setOnClickListener {
                    hidden.performClick()
                    navigationView.api.recenterCamera()
                }
            }
        }
    }

    private fun hideMapboxControl(view: View) {
        view.alpha = 0f
        view.isEnabled = true
        view.isClickable = true
        view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    private data class MapboxActionProxies(
        val compass: View?,
        val audio: View?,
        val recenter: View?,
    )

    private fun findMapboxActionProxies(root: ViewGroup): MapboxActionProxies {
        val hits = mutableListOf<View>()
        fun walk(group: ViewGroup) {
            for (i in 0 until group.childCount) {
                val c = group.getChildAt(i)
                val n = c.javaClass.name
                if (
                    n.contains("Compass", ignoreCase = true) ||
                        n.contains("AudioGuidance", ignoreCase = true) ||
                        n.contains("ExtendableButton", ignoreCase = true)
                ) {
                    hits.add(c)
                }
                if (c is ViewGroup) walk(c)
            }
        }
        walk(root)
        val compass = hits.firstOrNull { it.javaClass.name.contains("Compass", true) }
        val audio = hits.firstOrNull { it.javaClass.name.contains("AudioGuidance", true) }
        val recenter =
            hits.firstOrNull {
                it.javaClass.name.contains("ExtendableButton", true) &&
                    it !== compass &&
                    it !== audio
            }
        return MapboxActionProxies(compass, audio, recenter)
    }
}
