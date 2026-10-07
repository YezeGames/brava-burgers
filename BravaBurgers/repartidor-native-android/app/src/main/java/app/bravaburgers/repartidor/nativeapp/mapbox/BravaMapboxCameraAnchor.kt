package app.bravaburgers.repartidor.nativeapp.mapbox



import android.location.Location

import android.util.Log

import com.mapbox.geojson.Point

import com.mapbox.maps.CameraOptions

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



    /** Evita recentrar en 0,0 / null island antes del primer GPS real. */

    private var awaitingValidLocationForCamera = false

    private var lastValidLocation: Location? = null



    private val puckFramingStrategy = BravaPuckCenterFramingStrategy()



    fun isViewportBound(): Boolean = viewportDataSource != null && navigationCamera != null



    fun hasValidDriverLocation(): Boolean = lastValidLocation != null



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

        if (hasValidDriverLocation()) {

            recenterFollowing()

        }

        return true

    }



    fun onEnhancedLocation(location: Location) {

        if (!isValidNavLocation(location)) return

        lastValidLocation = Location(location)

        val vds = viewportDataSource ?: return

        vds.onLocationChanged(location)

        maintainFlatFollowing()

        vds.evaluate()

        if (awaitingValidLocationForCamera) {

            awaitingValidLocationForCamera = false

            applyDirectStreetCamera(location)

            requestFollowingMode()

            Log.i(TAG, "Initial street camera snap (first valid GPS)")

        }

    }



    fun onRouteProgressChanged(routeProgress: RouteProgress) {
        val vds = viewportDataSource ?: return
        vds.onRouteProgressChanged(routeProgress)
        maintainFlatFollowing()
        vds.evaluate()
    }

    /** Vista calle en el origen del pedido mientras llega el primer fix GPS (evita zoom continente). */
    fun seedStreetCameraAt(
        latitude: Double,
        longitude: Double,
    ) {
        if (!isValidNavCoordinate(latitude, longitude)) return
        val vds = viewportDataSource ?: return
        val loc =
            Location("brava-route-origin").apply {
                this.latitude = latitude
                this.longitude = longitude
            }
        lastValidLocation = loc
        vds.onLocationChanged(loc)
        maintainFlatFollowing()
        vds.evaluate()
        applyDirectStreetCamera(loc)
        requestFollowingMode()
        Log.i(TAG, "Seeded street camera at route origin")
    }



    fun onRoutesChanged(hasRoutes: Boolean, primaryRoute: com.mapbox.navigation.base.route.NavigationRoute?) {

        val vds = viewportDataSource ?: return

        if (!hasRoutes || primaryRoute == null) {

            vds.clearRouteData()

            awaitingValidLocationForCamera = false

        } else {

            vds.onRouteChanged(primaryRoute)

            awaitingValidLocationForCamera = true

        }

        maintainFlatFollowing()

        vds.evaluate()

        // No recenterFollowing aquí: sin GPS válido Mapbox cae en vista continente (0,0).

    }



    /** Reaplica perfil 2D course-up + puck centrado (Mapbox puede resetear options en ticks de ruta). */

    fun maintainFlatFollowing() {

        if (viewportDataSource == null) return

        applyFlatPuckCenteredProfile()

    }



    fun recenterFollowing() {

        if (navigationCamera == null || viewportDataSource == null) return

        maintainFlatFollowing()

        lastValidLocation?.let { applyDirectStreetCamera(it) }

        viewportDataSource?.evaluate()

        requestFollowingMode()

    }



    fun invalidatePaddingCache() {

        // reservado por si se cachea padding en el futuro

    }



    fun reset() {

        mapView = null

        viewportDataSource = null

        navigationCamera = null

        awaitingValidLocationForCamera = false

        lastValidLocation = null

    }



    override fun onAttached(mapboxNavigation: MapboxNavigation) {

        // Datos de cámara se alimentan desde BravaMapboxNavigation (enhanced location).

    }



    override fun onDetached(mapboxNavigation: MapboxNavigation) {

    }



    fun isValidNavLocation(location: Location): Boolean = isValidNavCoordinate(location.latitude, location.longitude)



    private fun isValidNavCoordinate(

        latitude: Double,

        longitude: Double,

    ): Boolean {

        if (!latitude.isFinite() || !longitude.isFinite()) return false

        if (latitude == 0.0 && longitude == 0.0) return false

        if (kotlin.math.abs(latitude) < 0.0001 && kotlin.math.abs(longitude) < 0.0001) return false

        return true

    }



    /** Zoom/pitch fijos + centro real antes de NavigationCamera following (evita overview). */

    private fun applyDirectStreetCamera(location: Location) {

        val mapboxMap = mapView?.getMapboxMap() ?: return

        if (!isValidNavLocation(location)) return

        val camera =

            CameraOptions.Builder()

                .center(Point.fromLngLat(location.longitude, location.latitude))

                .zoom(FOLLOWING_ZOOM)

                .pitch(0.0)

                .apply {

                    if (location.hasBearing()) {

                        bearing(location.bearing.toDouble())

                    }

                }.build()

        mapboxMap.setCamera(camera)

    }



    private fun requestFollowingMode() {

        val cam = navigationCamera ?: return

        cam.requestNavigationCameraToFollowing(

            stateTransitionOptions =

                NavigationCameraTransitionOptions

                    .Builder()

                    .maxDuration(0L)

                    .build(),

        )

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


