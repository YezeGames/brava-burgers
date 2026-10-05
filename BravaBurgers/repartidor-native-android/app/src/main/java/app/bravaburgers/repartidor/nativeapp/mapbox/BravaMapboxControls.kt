package app.bravaburgers.repartidor.nativeapp.mapbox

import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import com.mapbox.navigation.dropin.NavigationView
import com.mapbox.navigation.ui.voice.model.SpeechVolume

object BravaMapboxControls {
    private var voiceMuted = false
    private const val MAPBOX_DROPIN_PKG = "com.mapbox.navigation.dropin"

    fun wire(
        navigationView: NavigationView,
        compass: ImageButton,
        volume: ImageButton,
        recenter: ImageButton,
    ) {
        recenter.setOnClickListener {
            navigationView.api.recenterCamera()
            clickMapboxControl(navigationView, "mapboxRecenterButton", "mapbox_recenter")
        }
        volume.setOnClickListener {
            val player = navigationView.api.getCurrentVoiceInstructionsPlayer()
            if (player != null) {
                voiceMuted = !voiceMuted
                player.volume(SpeechVolume(if (voiceMuted) 0f else 1f))
            } else {
                clickMapboxControl(navigationView, "mapboxSoundButton", "mapbox_sound_button")
            }
        }
        compass.setOnClickListener {
            clickMapboxControl(navigationView, "mapboxCompassButton", "mapbox_compass_button")
        }
        navigationView.post { maskMapboxActionUi(navigationView) }
        navigationView.postDelayed({ maskMapboxActionUi(navigationView) }, 400)
        navigationView.postDelayed({ maskMapboxActionUi(navigationView) }, 1200)
    }

    private fun clickMapboxControl(
        root: View,
        vararg idNames: String,
    ) {
        findMapboxControl(root, *idNames)?.performClick()
    }

    private fun maskMapboxActionUi(root: ViewGroup) {
        val ids =
            listOf(
                "mapboxSoundButton",
                "mapbox_sound_button",
                "mapboxRecenterButton",
                "mapbox_recenter",
                "mapboxCompassButton",
                "mapbox_compass_button",
            )
        for (name in ids) {
            findMapboxControl(root, name)?.let { maskMapboxControl(it) }
        }
        maskActionColumns(root)
    }

    private fun maskActionColumns(root: ViewGroup) {
        fun walk(group: ViewGroup) {
            val score = scoreActionColumn(group)
            if (score >= 2) {
                for (i in 0 until group.childCount) {
                    maskMapboxControl(group.getChildAt(i))
                }
                group.alpha = 0f
                return
            }
            for (i in 0 until group.childCount) {
                val c = group.getChildAt(i)
                if (c is ViewGroup) walk(c)
            }
        }
        walk(root)
    }

    private fun scoreActionColumn(group: ViewGroup): Int {
        var n = 0
        for (i in 0 until group.childCount) {
            val nName = group.getChildAt(i).javaClass.name
            if (
                nName.contains("ExtendableButton", true) ||
                    nName.contains("AudioGuidance", true) ||
                    nName.contains("Compass", true)
            ) {
                n++
            }
        }
        return n
    }

    private fun maskMapboxControl(view: View) {
        view.alpha = 0f
        view.isClickable = true
        view.isEnabled = true
        view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    private fun findMapboxControl(
        root: View,
        vararg idNames: String,
    ): View? {
        for (name in idNames) {
            val id = root.resources.getIdentifier(name, "id", MAPBOX_DROPIN_PKG)
            if (id != 0) {
                root.rootView.findViewById<View>(id)?.let { return it }
            }
        }
        if (root is ViewGroup) {
            for (i in 0 until root.childCount) {
                val c = root.getChildAt(i)
                findMapboxControl(c, *idNames)?.let { return it }
            }
        }
        return null
    }
}
