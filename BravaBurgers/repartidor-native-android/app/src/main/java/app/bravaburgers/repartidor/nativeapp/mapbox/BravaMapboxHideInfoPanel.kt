package app.bravaburgers.repartidor.nativeapp.mapbox

import com.mapbox.navigation.dropin.NavigationView

/**
 * El panel inferior se oculta vía [BravaMapboxDropInUi] (`infoPanelForcedState = HIDDEN`).
 * No tocamos el árbol de vistas: ocultar clases con "BottomSheet" dejaba el mapa en negro.
 */
object BravaMapboxHideInfoPanel {
    @Suppress("UNUSED_PARAMETER")
    fun forceHidden(navigationView: NavigationView) {
        // Intentionally empty — options-only hiding.
    }
}
