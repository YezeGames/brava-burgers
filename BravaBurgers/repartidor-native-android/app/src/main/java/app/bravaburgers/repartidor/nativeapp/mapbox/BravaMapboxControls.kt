package app.bravaburgers.repartidor.nativeapp.mapbox

import android.widget.ImageButton
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.ui.voice.model.SpeechVolume

object BravaMapboxControls {
    private var voiceMuted = false

    fun wire(
        navigationView: NavigationView,
        compass: ImageButton,
        volume: ImageButton,
        recenter: ImageButton,
        refreshCamera: () -> Unit,
    ) {
        recenter.setOnClickListener {
            refreshCamera()
            BravaMapboxCameraAnchor.refreshViewportProfile(navigationView)
            navigationView.api.recenterCamera()
        }
        volume.setOnClickListener {
            val player = navigationView.api.getCurrentVoiceInstructionsPlayer()
            if (player != null) {
                voiceMuted = !voiceMuted
                player.volume(SpeechVolume(if (voiceMuted) 0f else 1f))
                volume.alpha = if (voiceMuted) 0.45f else 1f
            }
        }
        compass.setOnClickListener {
            refreshCamera()
            navigationView.api.recenterCamera()
        }
    }
}
