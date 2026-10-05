package app.bravaburgers.repartidor.nativeapp.mapbox

import android.view.View
import android.view.ViewGroup
import com.mapbox.navigation.dropin.NavigationView

/** Oculta el bottom sheet vacío del drop-in (franja negra sobre el mapa). */
object BravaMapboxHideInfoPanel {
    fun forceHidden(navigationView: NavigationView) {
        navigationView.post { hideInfoPanelViews(navigationView) }
        navigationView.postDelayed({ hideInfoPanelViews(navigationView) }, 350)
        navigationView.postDelayed({ hideInfoPanelViews(navigationView) }, 1200)
    }

    private fun hideInfoPanelViews(root: View) {
        fun walk(view: View) {
            val name = view.javaClass.name
            if (
                name.contains("InfoPanel", ignoreCase = true) ||
                    name.contains("BottomSheet", ignoreCase = true) ||
                    name.contains("SummaryBottomSheet", ignoreCase = true)
            ) {
                view.visibility = View.GONE
                view.layoutParams?.let { lp ->
                    lp.height = 0
                    view.layoutParams = lp
                }
            }
            if (view is ViewGroup) {
                for (i in 0 until view.childCount) {
                    walk(view.getChildAt(i))
                }
            }
        }
        walk(root)
    }
}
