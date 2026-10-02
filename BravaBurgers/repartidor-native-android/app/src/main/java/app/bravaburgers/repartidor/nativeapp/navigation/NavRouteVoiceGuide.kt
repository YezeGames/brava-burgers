package app.bravaburgers.repartidor.nativeapp.navigation

import android.content.Context
import android.os.Handler
import android.os.Looper
import app.bravaburgers.repartidor.nativeapp.data.NavStep
import app.bravaburgers.repartidor.nativeapp.data.RouteResult
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.sin
import kotlin.math.sqrt

/** Voz turn-by-turn: 1 aviso lejos + 1 corto al girar; próxima maniobra importante. */
class NavRouteVoiceGuide(context: Context) {
    data class ArrivalContext(
        val clientLabel: String?,
        val destLat: Double,
        val destLng: Double,
    )

    data class Tick(
        val instruction: String,
        val distanceToManeuverM: Int?,
        val stepIndex: Int,
        val stepCount: Int,
    )

    private val mainHandler = Handler(Looper.getMainLooper())
    private val tts = BravaNavigationTts(context)
    private var enabled = true

    private var route: List<Pair<Double, Double>> = emptyList()
    private var steps: List<NavStep> = emptyList()
    private var maneuverAlongM: DoubleArray = doubleArrayOf()
    private val spokenTiers = mutableMapOf<Int, MutableSet<String>>()
    private val utteranceSeq = AtomicInteger(0)
    private var lastSpokenLine: String? = null
    private var lastSpokenAtMs = 0L
    private var lastSpokenVoiceKey: String? = null
    private var arrival: ArrivalContext? = null

    fun setEnabled(on: Boolean) {
        enabled = on
        if (!on) mainHandler.post { tts.stop() }
    }

    fun ensureInit() {
        tts.ensureInit()
    }

    fun reset() {
        route = emptyList()
        steps = emptyList()
        maneuverAlongM = doubleArrayOf()
        spokenTiers.clear()
        lastSpokenLine = null
        lastSpokenVoiceKey = null
        arrival = null
        mainHandler.post { tts.stop() }
    }

    fun shutdown() {
        reset()
        tts.shutdown()
    }

    fun speakOffRoute() {
        speak("Te saliste de la ruta. Recalculando.", flush = true, voiceKey = "offroute")
    }

    private fun bindRoute(result: RouteResult) {
        route = result.coordinates
        steps = result.steps
        maneuverAlongM =
            if (route.size >= 2) {
                NavRouteProgress.maneuverAlongRouteM(steps, route)
            } else {
                NavRouteProgress.rebuildStepDistances(steps)
            }
        spokenTiers.clear()
    }

    fun announceReroute(result: RouteResult) {
        bindRoute(result)
        lastSpokenLine = null
        lastSpokenVoiceKey = null
        val target = significantTarget(0)
        val step = steps.getOrNull(target)?.dto
        val instr =
            if (step == null) {
                result.firstManeuver
            } else {
                OsrmNavText.maneuverText(step)
            }
        speak("Recalculando ruta. $instr", flush = true, voiceKey = "reroute|${OsrmNavText.maneuverVoiceKey(step)}")
    }

    fun startRoute(result: RouteResult, parada: Int?, arrivalContext: ArrivalContext?) {
        reset()
        arrival = arrivalContext
        bindRoute(result)
        val totalM = result.distanceM
        val intro =
            buildString {
                if (parada != null) append("Parada $parada. ")
                if (totalM > 600) {
                    append("Son ${OsrmNavText.formatDistSpeech(totalM)} hasta el destino.")
                } else if (parada == null) {
                    append("Iniciá el recorrido.")
                }
            }.trim()
        if (intro.isEmpty()) return
        mainHandler.postDelayed({
            if (!enabled) return@postDelayed
            speak(intro, flush = true, voiceKey = "intro")
        }, 500L)
    }

    fun nextSignificantStepIndex(afterStepIndex: Int): Int? {
        if (steps.isEmpty()) return null
        var i = afterStepIndex + 1
        while (i < steps.size && OsrmNavText.isLowValueManeuver(steps[i].dto)) {
            i++
        }
        return i.takeIf { it < steps.size }
    }

    fun nextSignificantInstruction(afterStepIndex: Int): String? {
        val i = nextSignificantStepIndex(afterStepIndex) ?: return null
        return OsrmNavText.maneuverText(steps[i].dto)
    }

    fun maneuverModifierAt(stepIndex: Int): String? =
        steps.getOrNull(stepIndex)?.dto?.maneuver?.modifier

    fun bannerPrimary(stepIndex: Int): String {
        val step = steps.getOrNull(stepIndex)?.dto
        return if (step == null) {
            "Seguí la ruta resaltada"
        } else {
            OsrmNavText.maneuverText(step)
        }
    }

    fun routeProgressSnapshot(lat: Double, lng: Double): NavRouteProgress.Snapshot? {
        if (route.size < 2 || maneuverAlongM.isEmpty() || steps.isEmpty()) return null
        return NavRouteProgress.snapshot(lat, lng, route, steps, maneuverAlongM)
    }

    fun matcherManeuverAlongM(): DoubleArray = maneuverAlongM

    fun onDriverPosition(lat: Double, lng: Double): Tick? {
        if (steps.isEmpty()) return null
        val snap =
            if (route.size >= 2 && maneuverAlongM.isNotEmpty()) {
                NavRouteProgress.snapshot(lat, lng, route, steps, maneuverAlongM)
            } else {
                null
            }
        val targetIdx = snap?.stepIndex ?: significantTarget(0)
        val distM =
            snap?.distanceToManeuverM ?: fallbackDistM(lat, lng, targetIdx)
        val step = steps.getOrNull(targetIdx) ?: return null
        val along = snap?.alongRouteM
        val side = resolveArrivalSide(lat, lng, along)
        maybeSpeakNavVoice(targetIdx, distM, step, side)
        val distInt = distM.takeIf { it.isFinite() }?.let { round(it).toInt() }
        val instruction =
            if (step.type == "arrive" || (distInt != null && distInt <= 55 && targetIdx == steps.lastIndex)) {
                OsrmNavText.arrivePhrase(arrival?.clientLabel, side)
            } else {
                OsrmNavText.displayInstruction(step.dto, distInt)
            }
        return Tick(
            instruction = instruction,
            distanceToManeuverM = distInt,
            stepIndex = targetIdx,
            stepCount = steps.size,
        )
    }

    private fun resolveArrivalSide(
        driverLat: Double,
        driverLng: Double,
        alongRouteM: Double?,
    ): NavArrivalSide.Side? {
        val ctx = arrival ?: return null
        if (route.size < 2 || alongRouteM == null) return null
        return NavArrivalSide.sideOfDestination(
            driverLat,
            driverLng,
            ctx.destLat,
            ctx.destLng,
            route,
            alongRouteM,
        )
    }

    private fun significantTarget(rawIndex: Int): Int = OsrmNavText.significantStepIndex(steps, rawIndex)

    private fun fallbackDistM(lat: Double, lng: Double, idx: Int): Double {
        val step = steps.getOrNull(idx) ?: return 0.0
        return haversineM(lat, lng, step.lat, step.lng)
    }

    private fun maybeSpeakNavVoice(
        idx: Int,
        distToManeuverM: Double,
        step: NavStep,
        arrivalSide: NavArrivalSide.Side?,
    ) {
        if (!enabled || !tts.ready) return
        val dto = step.dto
        if (OsrmNavText.isLowValueManeuver(dto)) return

        val voiceKey = OsrmNavText.maneuverVoiceKey(dto)
        val tiers = spokenTiers.getOrPut(idx) { mutableSetOf() }

        if (step.type == "arrive") {
            if (distToManeuverM in 70.0..130.0 && arrivalSide != null && "side_hint" !in tiers) {
                tiers.add("side_hint")
                val hint =
                    when (arrivalSide) {
                        NavArrivalSide.Side.RIGHT -> "Tu destino está a la derecha"
                        NavArrivalSide.Side.LEFT -> "Tu destino está a la izquierda"
                    }
                speak(hint, flush = false, voiceKey = "side_hint|${arrivalSide.name}")
            }
            if (distToManeuverM <= 45 && "arrive" !in tiers) {
                tiers.add("arrive")
                val line = OsrmNavText.arrivePhrase(arrival?.clientLabel, arrivalSide)
                speak(line, flush = true, voiceKey = "arrive")
            }
            return
        }

        val previewSpoken = "ahead" in tiers

        when {
            distToManeuverM <= VOICE_NOW && "now" !in tiers -> {
                tiers.add("now")
                val line = OsrmNavText.voiceNowLine(dto, previewSpoken)
                speak(line, flush = true, voiceKey = "now|$voiceKey")
            }
            distToManeuverM in VOICE_AHEAD_MIN..VOICE_AHEAD_MAX && "ahead" !in tiers -> {
                tiers.add("ahead")
                val line = OsrmNavText.voiceAheadLine(dto, distToManeuverM)
                speak(line, flush = false, voiceKey = "ahead|$voiceKey")
            }
        }
    }

    private fun speak(text: String, flush: Boolean, voiceKey: String) {
        val line = text.trim()
        if (line.isEmpty() || !enabled) return
        val now = System.currentTimeMillis()
        if (
            (line == lastSpokenLine || voiceKey == lastSpokenVoiceKey) &&
            now - lastSpokenAtMs < MIN_REPEAT_MS
        ) {
            return
        }
        lastSpokenLine = line
        lastSpokenVoiceKey = voiceKey
        lastSpokenAtMs = now
        mainHandler.post {
            val id = "brava-nav-${utteranceSeq.incrementAndGet()}"
            tts.speak(line, flush, id)
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
        /** Un aviso entre ~120 y ~180 m (moto / ciudad). */
        private const val VOICE_AHEAD_MIN = 120.0
        private const val VOICE_AHEAD_MAX = 180.0
        private const val VOICE_NOW = 30.0
        private const val MIN_REPEAT_MS = 20_000L
    }
}
