package app.bravaburgers.repartidor.nativeapp.session

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Tras reinicio del teléfono: reanudar GPS si había entrega en curso. */
class RepartidorBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val snap = SessionServicePrefs.read(context)
        if (!snap.sessionOn) return
        RepartoSessionForegroundService.ensureGpsIfNeeded(context)
        SessionWorkScheduler.schedule(context)
    }
}
