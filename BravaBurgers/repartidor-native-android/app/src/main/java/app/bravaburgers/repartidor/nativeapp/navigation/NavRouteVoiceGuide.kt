package app.bravaburgers.repartidor.nativeapp.navigation

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import app.bravaburgers.repartidor.nativeapp.data.NavStep
import app.bravaburgers.repartidor.nativeapp.data.RouteResult
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Voz turn-by-turn (umbrales como repartidor/index.html). */
class NavRouteVoiceGuide(context: Context) {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var ready = false
    private var enabled = true

    private var steps: List<NavStep> = emptyList()
    private var currentStepIndex = 0
    private val spokenTiers = mutableMapOf<Int, MutableSet<String>>()
    private val utteranceSeq = AtomicInteger(0)

    fun setEnabled(on: Boolean) {
        enabled = on
        if (!on) tts?.stop()
    }

    fun ensureInit() {
        if (tts != null) return
        tts =
            TextToSpeech(appContext) { status ->
                ready = status == TextToSpeech.SUCCESS
                if (ready) {
                    val t = tts ?: return@TextToSpeech
                    val locales =
                        listOf(
                            Locale("es", "AR"),
                            Locale("es", "ES"),
                            Locale("es", "MX"),
                            Locale("es"),
                        )
                    for (loc in locales) {
                        if (t.setLanguage(loc) != TextToSpeech.LANG_NOT_SUPPORTED) break
                    }
                    t.setSpeechRate(0.92f)
                    t.setPitch(1f)
                }
            }
    }

    fun reset() {
        steps = emptyList()
        currentStepIndex = 0
        spokenTiers.clear()
        mainHandler.post { tts?.stop() }
    }

    fun shutdown() {
        reset()
        tts?.shutdown()
        tts = null
        ready = false
    }

    fun speakOffRoute() {
        speak("Te saliste de la ruta. Recalculando.")
    }

    /** Tras reroute OSRM (como web: «Recalculamos la ruta…»). */
    fun announceReroute(result: RouteResult) {
        steps = result.steps
        currentStepIndex = 0
        spokenTiers.clear()
        val instr =
            if (steps.isEmpty()) {
                result.firstManeuver
            } else {
                steps.first().speech
            }
        speak("Recalculamos la ruta. $instr")
    }

    fun startRoute(result: RouteResult, parada: Int?) {
        reset()
        steps = result.steps
        val totalM = result.distanceM
        val intro =
            if (steps.isEmpty()) {
                result.firstManeuver
            } else {
                buildString {
                    if (parada != null) append("Parada $parada. ")
                    if (totalM > 600) append("Recorrido de ${OsrmNavText.formatDistSpeech(totalM)}. ")
                    append(steps.first().speech)
                }
            }
        mainHandler.postDelayed({
            if (!enabled) return@postDelayed
            speak(intro)
        }, 500L)
    }

    /** Devuelve maniobra actual para la UI. */
    fun onDriverPosition(lat: Double, lng: Double): String? {
        if (steps.isEmpty()) return null
        advanceStepIfPassed(lat, lng)
        val step = steps.getOrNull(currentStepIndex) ?: return null
        val distM = haversineM(lat, lng, step.lat, step.lng)
        maybeSpeakNavVoice(currentStepIndex, distM, step)
        return step.speech
    }

    private fun advanceStepIfPassed(lat: Double, lng: Double) {
        while (currentStepIndex < steps.size - 1) {
            val d = haversineM(lat, lng, steps[currentStepIndex].lat, steps[currentStepIndex].lng)
            if (d <= PASS_STEP_M) {
                currentStepIndex++
            } else {
                break
            }
        }
    }

    private fun maybeSpeakNavVoice(idx: Int, distToManeuverM: Double, step: NavStep) {
        if (!enabled || !ready) return
        val tiers = spokenTiers.getOrPut(idx) { mutableSetOf() }
        if (step.type == "arrive") {
            if (distToManeuverM <= 40 && "arrive" !in tiers) {
                tiers.add("arrive")
                speak("Llegaste al destino.")
            }
            return
        }
        when {
            distToManeuverM <= VOICE_NOW && "now" !in tiers -> {
                tiers.add("now")
                speak(step.speech)
            }
            distToManeuverM <= VOICE_NEAR && distToManeuverM > VOICE_NOW && "near" !in tiers -> {
                tiers.add("near")
                speak(OsrmNavText.maneuverSpeechLine(step.dto, distToManeuverM, VOICE_NOW))
            }
            distToManeuverM <= VOICE_MID && distToManeuverM > VOICE_NEAR && "mid" !in tiers -> {
                tiers.add("mid")
                speak(OsrmNavText.maneuverSpeechLine(step.dto, distToManeuverM, VOICE_NOW))
            }
            distToManeuverM <= VOICE_FAR && distToManeuverM > VOICE_MID && "far" !in tiers -> {
                tiers.add("far")
                speak(OsrmNavText.maneuverSpeechLine(step.dto, distToManeuverM, VOICE_NOW))
            }
        }
    }

    private fun speak(text: String) {
        val line = text.trim()
        if (line.isEmpty() || !enabled) return
        mainHandler.post {
            val engine = tts ?: return@post
            if (!ready) return@post
            val id = "brava-nav-${utteranceSeq.incrementAndGet()}"
            engine.speak(line, TextToSpeech.QUEUE_ADD, null, id)
        }
    }

    private fun haversineM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a =
            sin(dLat / 2).pow(2.0) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2.0)
        return 2 * r * asin(sqrt(a.coerceIn(0.0, 1.0)))
    }

    companion object {
        private const val PASS_STEP_M = 25.0
        private const val VOICE_FAR = 480.0
        private const val VOICE_MID = 200.0
        private const val VOICE_NEAR = 75.0
        private const val VOICE_NOW = 22.0
    }
}
