package app.bravaburgers.repartidor.nativeapp.mapbox

import android.widget.ImageButton

object BravaMapboxControls {
    fun wire(
        compass: ImageButton,
        volume: ImageButton,
        recenter: ImageButton,
        refreshCamera: () -> Unit,
    ) {
        recenter.setOnClickListener {
            refreshCamera()
            BravaMapboxCameraAnchor.recenterFollowing()
        }
        volume.setOnClickListener {
            val muted = BravaMapboxMapSession.toggleVoiceMute()
            volume.alpha = if (muted) 0.45f else 1f
        }
        compass.setOnClickListener {
            refreshCamera()
            BravaMapboxCameraAnchor.recenterFollowing()
        }
    }
}
