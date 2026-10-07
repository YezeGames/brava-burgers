package app.bravaburgers.repartidor.nativeapp.mapbox

import android.util.Log
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.lifecycle.MapboxNavigationObserver
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.ui.maps.camera.NavigationCamera
import com.mapbox.navigation.ui.maps.camera.data.FollowingFrameOptions
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import com.mapbox.navigation.ui.maps.camera.transition.NavigationCameraTransitionOptions

/**
 * Cámara Brava vía APIs públicas del Navigation SDK (sin reflection):
 * [MapboxNavigationViewportDataSource] + [NavigationCamera] sobre el [MapView] del drop-in.
 */
@OptIn(ExperimentalPreviewMapboxNavigationAPI::class)
object BravaMapboxCameraAnchor : MapboxNavigationObserver {
    private const val TAG = "BravaMapboxCamera"
    private const val FROZEN_MAP_BEARING = 0.0

    private var mapView: MapView? = null
    private var viewportDataSource: MapboxNavigationViewportDataSource? = null
    private var navigationCamera: NavigationCamera? = null
    private var registeredWithApp = false
    private var navAttached = false

    private var lastTopPx = -1.0
    private var lastBottomPx = -1.0

    private val puckFramingStrategy = BravaPuckCenterFramingStrategy()

    private val locationObserver =
        object : LocationObserver {
            override fun onNewRawLocation(rawLocation: android.location.Location) {
                onDriverLocation(rawLocation)
            }

            override fun onNewLocationMatcherResult(locationMatcherResult: LocationMatcherResult) {
                onDriverLocation(locationMatcherResult.enhancedLocation)
            }
        }

    private val routeProgressObserver =
        RouteProgressObserver { progress ->
            val vds = viewportDataSource ?: return@RouteProgressObserver
            vds.onRouteProgressChanged(progress)
            maintainFlatFollowing()
            vds.evaluate()
        }

    private val routesObserver =
        RoutesObserver { update ->
            val vds = viewportDataSource ?: return@RoutesObserver
            val routes = update.navigationRoutes
            if (routes.isEmpty()) {
                vds.clearRouteData()
            } else {
                vds.onRouteChanged(routes.first())
            }
            vds.evaluate()
        }

    fun isViewportBound(): Boolean = viewportDataSource != null && navigationCamera != null

    fun ensureRegistered() {
        if (registeredWithApp) return
        MapboxNavigationApp.registerObserver(this)
        registeredWithApp = true
    }

    /** Llamado cuando el drop-in adjunta el [MapView] (MapViewObserver). */
    fun onMapViewAttached(mapView: MapView) {
        if (this.mapView === mapView && viewportDataSource != null) return
        this.mapView = mapView
        val mapboxMap = mapView.getMapboxMap()
        viewportDataSource = MapboxNavigationViewportDataSource(mapboxMap)
        navigationCamera =
            NavigationCamera(
                mapboxMap,
                mapView.camera,
                viewportDataSource!!,
            )
        applyFlatPuckCenteredProfile()
        Log.i(TAG, "NavigationCamera + ViewportDataSource creados (API pública)")
        MapboxNavigationApp.current()?.let { attachToNavigation(it) }
    }

    fun applyBravaOverlayPadding(
        topPx: Double,
        bottomPx: Double,
    ): Boolean {
        val vds = viewportDataSource ?: return false
        val top = topPx.coerceAtLeast(48.0)
        val bottom = bottomPx.coerceAtLeast(96.0)
        val vSym = kotlin.math.max(top, bottom)

        applyFlatPuckCenteredProfile()

        vds.followingPadding = EdgeInsets(vSym, 0.0, vSym, 0.0)
        vds.overviewPadding = EdgeInsets(vSym * 0.9, 0.0, vSym * 0.9, 0.0)

        lastTopPx = top
        lastBottomPx = bottom

        try {
            vds.evaluate()
        } catch (e: Exception) {
            Log.w(TAG, "evaluate failed: ${e.message}")
        }
        return true
    }

    fun maintainFlatFollowing() {
        val vds = viewportDataSource ?: return
        applyFlatPuckCenteredProfile()
        vds.followingBearingPropertyOverride(FROZEN_MAP_BEARING)
    }

    fun recenterFollowing() {
        val cam = navigationCamera ?: return
        maintainFlatFollowing()
        viewportDataSource?.evaluate()
        cam.requestNavigationCameraToFollowing(
            stateTransitionOptions =
                NavigationCameraTransitionOptions
                    .Builder()
                    .maxDuration(0L)
                    .build(),
        )
    }

    fun invalidatePaddingCache() {
        lastTopPx = -1.0
        lastBottomPx = -1.0
    }

    fun reset() {
        MapboxNavigationApp.current()?.let { detachFromNavigation(it) }
        mapView = null
        viewportDataSource = null
        navigationCamera = null
        lastTopPx = -1.0
        lastBottomPx = -1.0
        navAttached = false
    }

    override fun onAttached(mapboxNavigation: MapboxNavigation) {
        attachToNavigation(mapboxNavigation)
    }

    override fun onDetached(mapboxNavigation: MapboxNavigation) {
        detachFromNavigation(mapboxNavigation)
    }

    private fun attachToNavigation(mapboxNavigation: MapboxNavigation) {
        if (navAttached) return
        mapboxNavigation.registerLocationObserver(locationObserver)
        mapboxNavigation.registerRouteProgressObserver(routeProgressObserver)
        mapboxNavigation.registerRoutesObserver(routesObserver)
        navAttached = true
    }

    private fun detachFromNavigation(mapboxNavigation: MapboxNavigation) {
        if (!navAttached) return
        mapboxNavigation.unregisterLocationObserver(locationObserver)
        mapboxNavigation.unregisterRouteProgressObserver(routeProgressObserver)
        mapboxNavigation.unregisterRoutesObserver(routesObserver)
        navAttached = false
    }

    private fun onDriverLocation(location: android.location.Location) {
        val vds = viewportDataSource ?: return
        vds.onLocationChanged(location)
        maintainFlatFollowing()
        vds.evaluate()
    }

    private fun applyFlatPuckCenteredProfile() {
        val vds = viewportDataSource ?: return
        vds.options.followingFrameOptions.apply {
            defaultPitch = 0.0
            focalPoint = FollowingFrameOptions.FocalPoint(0.5, 0.5)
            maximizeViewableGeometryWhenPitchZero = false
            pitchNearManeuvers.enabled = false
            frameGeometryAfterManeuver.enabled = false
            intersectionDensityCalculation.enabled = false
            framingStrategy = puckFramingStrategy
            bearingUpdatesAllowed = false
            pitchUpdatesAllowed = false
        }
        vds.followingPitchPropertyOverride(0.0)
        vds.followingZoomPropertyOverride(null)
        vds.followingBearingPropertyOverride(FROZEN_MAP_BEARING)
    }
}
