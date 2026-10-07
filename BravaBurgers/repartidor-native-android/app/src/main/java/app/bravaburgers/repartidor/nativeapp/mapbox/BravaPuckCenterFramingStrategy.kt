package app.bravaburgers.repartidor.nativeapp.mapbox



import com.mapbox.geojson.Point

import com.mapbox.navigation.base.trip.model.RouteProgress

import com.mapbox.navigation.ui.maps.camera.data.FollowingCameraFramingStrategy

import com.mapbox.navigation.ui.maps.camera.data.FollowingFrameOptions



/** Solo la posición del conductor — la cámara no persigue geometría del giro. */

class BravaPuckCenterFramingStrategy : FollowingCameraFramingStrategy {

    override fun getPointsToFrameOnCurrentStep(

        routeProgress: RouteProgress,

        followingFrameOptions: FollowingFrameOptions,

        averageIntersectionDistancesOnRoute: List<List<Double>>,

    ): List<Point> {

        BravaMapboxNavigation.lastEnhancedLocationPoint?.let { return listOf(it) }
        val leg = routeProgress.currentLegProgress ?: return emptyList()
        val step = leg.currentStepProgress?.step ?: return emptyList()
        val loc = step.maneuver()?.location() ?: return emptyList()
        return listOf(loc)

    }



    override fun getPointsToFrameAfterCurrentManeuver(

        routeProgress: RouteProgress,

        followingFrameOptions: FollowingFrameOptions,

        postManeuverFramingPoints: List<List<List<Point>>>,

    ): List<Point> = emptyList()

}


