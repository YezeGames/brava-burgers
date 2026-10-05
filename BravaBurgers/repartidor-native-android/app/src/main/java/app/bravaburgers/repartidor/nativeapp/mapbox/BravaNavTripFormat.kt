package app.bravaburgers.repartidor.nativeapp.mapbox

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.roundToInt

data class BravaTripSummary(
    val primaryLine: String,
    val etaClockLine: String?,
)

object BravaNavTripFormat {
    private val locale = Locale("es", "AR")

    fun format(
        distanceRemainingM: Double,
        durationRemainingSec: Double,
    ): BravaTripSummary {
        val minutes = (durationRemainingSec / 60.0).roundToInt().coerceAtLeast(1)
        val km = distanceRemainingM / 1000.0
        val distanceLabel =
            if (km < 10) {
                String.format(locale, "%.1f km", km)
            } else {
                String.format(locale, "%.0f km", km)
            }
        val primary = "$minutes min · $distanceLabel"
        val cal =
            Calendar.getInstance().apply {
                add(Calendar.SECOND, durationRemainingSec.roundToInt().coerceAtLeast(0))
            }
        val clock = SimpleDateFormat("h:mm a", locale).format(cal.time).lowercase(locale)
        return BravaTripSummary(primaryLine = primary, etaClockLine = clock)
    }
}
