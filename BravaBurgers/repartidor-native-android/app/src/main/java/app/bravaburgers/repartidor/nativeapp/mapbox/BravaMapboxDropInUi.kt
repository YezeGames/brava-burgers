package app.bravaburgers.repartidor.nativeapp.mapbox

import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.doOnLayout
import androidx.core.view.updateLayoutParams
import com.mapbox.navigation.base.formatter.DistanceFormatterOptions
import com.mapbox.navigation.dropin.NavigationView
import java.util.Locale
import kotlin.math.roundToInt

object BravaMapboxDropInUi {
    private const val ACTION_BUTTON_DP = 44
    private const val ACTION_GAP_ABOVE_PANEL_DP = 10

    fun applyBravaOptions(navigationView: NavigationView) {
        val ctx = navigationView.context
        navigationView.customizeViewOptions {
            showTripProgress = false
            showRoadName = false
            showSpeedLimit = false
            showEndNavigationButton = false
            showCameraModeActionButton = false
            showCompassActionButton = true
            showToggleAudioActionButton = true
            showRecenterActionButton = true
            distanceFormatterOptions =
                DistanceFormatterOptions.Builder(ctx)
                    .locale(Locale("es", "AR"))
                    .build()
        }
        navigationView.customizeViewStyles {
            compassButtonStyle = app.bravaburgers.repartidor.nativeapp.R.style.BravaMapboxActionButton
            audioGuidanceButtonStyle = app.bravaburgers.repartidor.nativeapp.R.style.BravaMapboxActionButton
            recenterButtonStyle = app.bravaburgers.repartidor.nativeapp.R.style.BravaMapboxActionButton
        }
    }

    /** Brújula → audio → recentrar, columna angosta encima del panel Brava. */
    fun pinMapControlsAboveBravaPanel(
        navigationView: NavigationView,
        bravaBottomPanel: View,
        speedChip: View? = null,
    ) {
        val apply = {
            val density = navigationView.resources.displayMetrics.density
            val bottomInset =
                bravaBottomPanel.height +
                    (ACTION_GAP_ABOVE_PANEL_DP * density).roundToInt()
            navigationView.post {
                tightenAndMoveActionButtons(navigationView, bottomInset, density)
                speedChip?.updateLayoutParams<ViewGroup.MarginLayoutParams> {
                    bottomMargin = bottomInset
                }
            }
        }
        bravaBottomPanel.doOnLayout { apply() }
        bravaBottomPanel.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> apply() }
    }

    private fun tightenAndMoveActionButtons(
        root: ViewGroup,
        bottomInsetPx: Int,
        density: Float,
    ) {
        val column = findActionButtonColumn(root) ?: return
        val sizePx = (ACTION_BUTTON_DP * density).roundToInt()
        val marginEndPx = (12 * density).roundToInt()
        for (i in 0 until column.childCount) {
            val child = column.getChildAt(i)
            child.updateLayoutParams<ViewGroup.LayoutParams> {
                width = sizePx
                height = sizePx
            }
            (child.layoutParams as? ViewGroup.MarginLayoutParams)?.let { lp ->
                lp.bottomMargin = if (i == 0) 0 else (6 * density).roundToInt()
            }
        }
        column.updateLayoutParams<ViewGroup.MarginLayoutParams> {
            bottomMargin = bottomInsetPx
            marginEnd = marginEndPx
            width = sizePx
        }
        if (column.layoutParams is FrameLayout.LayoutParams) {
            (column.layoutParams as FrameLayout.LayoutParams).gravity =
                android.view.Gravity.BOTTOM or android.view.Gravity.END
        }
        ViewCompat.requestApplyInsets(column)
        column.requestLayout()
    }

    private fun findActionButtonColumn(root: ViewGroup): ViewGroup? {
        var best: ViewGroup? = null
        var bestScore = 0
        fun walk(group: ViewGroup) {
            val score = scoreActionColumn(group)
            if (score > bestScore) {
                bestScore = score
                best = group
            }
            for (i in 0 until group.childCount) {
                val c = group.getChildAt(i)
                if (c is ViewGroup) walk(c)
            }
        }
        walk(root)
        return best
    }

    private fun scoreActionColumn(group: ViewGroup): Int {
        var n = 0
        for (i in 0 until group.childCount) {
            val name = group.getChildAt(i).javaClass.name
            if (
                name.contains("ExtendableButton", ignoreCase = true) ||
                    name.contains("AudioGuidance", ignoreCase = true) ||
                    name.contains("Compass", ignoreCase = true)
            ) {
                n++
            }
        }
        return if (n >= 2) n else 0
    }
}
