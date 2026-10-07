package app.bravaburgers.repartidor.nativeapp.mapbox

import android.location.Location
import android.util.Log
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI
import com.mapbox.navigation.base.trip.model.RouteProgress
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.lifecycle.MapboxNavigationObserver
import com.mapbox.navigation.ui.maps.camera.NavigationCamera
import com.mapbox.navigation.ui.maps.camera.data.FollowingFrameOptions
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import com.mapbox.navigation.ui.maps.camera.transition.NavigationCameraTransitionOptions

/**
 * Cámara 2D course-up (rumbo hacia arriba) sobre [MapView] nativo.
 * Puck centrado en X; padding solo arriba/abajo (panel Brava).
 */
@OptIn(ExperimentalPreviewMapboxNavigationAPI::class)
object BravaMapboxCameraAnchor : MapboxNavigationObserver {
    private const val TAG = "BravaMapboxCamera"
    /** Zoom de calle en modo following (evita vista overview/ciudad al iniciar). */
    private const val FOLLOWING_ZOOM = 16.5

    private var mapView: MapView? = null
    private var viewportDataSource: MapboxNavigationViewportDataSource? = null
    private var navigationCamera: NavigationCamera? = null
    private var registeredWithApp = false
    private var pendingInitialFollowingRecenter = false

    private val puckFramingStrategy = BravaPuckCenterFramingStrategy()

    fun isViewportBound(): Boolean = viewportDataSource != null && navigationCamera != null

    fun ensureRegistered() {
        if (registeredWithApp) return
        MapboxNavigationApp.registerObserver(this)
        registeredWithApp = true
    }

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
        Log.i(TAG, "NavigationCamera + ViewportDataSource (MapView nativo)")
    }

    /**
     * @param bottomMarginPx margen extra bajo el panel (px) para resguardo visual.
     */
    fun applyBravaOverlayPadding(
        topPx: Double,
        bottomPx: Double,
        bottomMarginPx: Double = 24.0,
    ): Boolean {
        val vds = viewportDataSource ?: return false
        val top = topPx.coerceAtLeast(48.0)
        val bottom = (bottomPx + bottomMarginPx).coerceAtLeast(96.0)

        applyFlatPuckCenteredProfile()

        vds.followingPadding = EdgeInsets(top, 0.0, bottom, 0.0)
        vds.overviewPadding = EdgeInsets(top * 0.95, 0.0, bottom * 0.95, 0.0)

        try {
            vds.evaluate()
        } catch (e: Exception) {
            Log.w(TAG, "evaluate failed: ${e.message}")
        }
        recenterFollowing()
        return true
    }

    fun onEnhancedLocation(location: Location) {
        val vds = viewportDataSource ?: return
        vds.onLocationChanged(location)
        maintainFlatFollowing()
        vds.evaluate()
        if (pendingInitialFollowingRecenter) {
            pendingInitialFollowingRecenter = false
            recenterFollowing()
        }
    }

    fun onRouteProgressChanged(routeProgress: RouteProgress) {
        val vds = viewportDataSource ?: return
        vds.onRouteProgressChanged(routeProgress)
        maintainFlatFollowing()
        vds.evaluate()
    }

    fun onRoutesChanged(hasRoutes: Boolean, primaryRoute: com.mapbox.navigation.base.route.NavigationRoute?) {
        val vds = viewportDataSource ?: return
        if (!hasRoutes || primaryRoute == null) {
            vds.clearRouteData()
        } else {
            vds.onRouteChanged(primaryRoute)
        }
        maintainFlatFollowing()
        vds.evaluate()
        if (hasRoutes && primaryRoute != null) {
            pendingInitialFollowingRecenter = true
            recenterFollowing()
        } else {
            pendingInitialFollowingRecenter = false
        }
    }

    /** Reaplica perfil 2D course-up + puck centrado (Mapbox puede resetear options en ticks de ruta). */
    fun maintainFlatFollowing() {
        if (viewportDataSource == null) return
        applyFlatPuckCenteredProfile()
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
        // reservado por si se cachea padding en el futuro
    }

    fun reset() {
        mapView = null
        viewportDataSource = null
        navigationCamera = null
        pendingInitialFollowingRecenter = false
    }

    override fun onAttached(mapboxNavigation: MapboxNavigation) {
        // Datos de cámara se alimentan desde BravaMapboxNavigation (enhanced location).
    }

    override fun onDetached(mapboxNavigation: MapboxNavigation) {
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
            bearingSmoothing.enabled = false
            bearingUpdatesAllowed = true
            pitchUpdatesAllowed = false
            zoomUpdatesAllowed = false
            paddingUpdatesAllowed = false
            minZoom = FOLLOWING_ZOOM
            maxZoom = FOLLOWING_ZOOM
        }
        vds.followingPitchPropertyOverride(0.0)
        vds.followingZoomPropertyOverride(FOLLOWING_ZOOM)
        vds.overviewZoomPropertyOverride(FOLLOWING_ZOOM)
        vds.followingBearingPropertyOverride(null)
    }
}
