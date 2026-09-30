package app.bravaburgers.repartidor.nativeapp.navigation

import android.content.Context
import android.content.Intent
import android.os.Build
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.util.Locale

/**
 * TTS del dispositivo. Prioriza el motor **Google Text-to-Speech** (misma familia que muchos
 * teléfonos usan con Maps), sin API de pago ni paquetes offline de Google Maps (no redistribuibles).
 */
class BravaNavigationTts(context: Context) {
    private val appContext = context.applicationContext
    private var tts: TextToSpeech? = null
    private var initWithGoogle = true
    var ready = false
        private set

    fun ensureInit(onReady: (() -> Unit)? = null) {
        if (tts != null) {
            if (ready) onReady?.invoke()
            return
        }
        val engine = if (initWithGoogle) GOOGLE_ENGINE else null
        tts =
            if (engine != null) {
                TextToSpeech(appContext, { status -> onEngineReady(status, onReady) }, engine)
            } else {
                TextToSpeech(appContext) { status -> onEngineReady(status, onReady) }
            }
    }

    private fun onEngineReady(status: Int, onReady: (() -> Unit)?) {
        if (status != TextToSpeech.SUCCESS && initWithGoogle) {
            initWithGoogle = false
            tts?.shutdown()
            tts = null
            ready = false
            ensureInit(onReady)
            return
        }
        ready = status == TextToSpeech.SUCCESS
        if (!ready) return
        val engine = tts ?: return
        configureVoice(engine)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            engine.setOnUtteranceProgressListener(
                object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}

                    override fun onDone(utteranceId: String?) {}

                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {}
                },
            )
        }
        onReady?.invoke()
    }

    private fun configureVoice(engine: TextToSpeech) {
        val locales =
            listOf(
                Locale("es", "AR"),
                Locale("es", "419"),
                Locale("es", "ES"),
                Locale("es", "MX"),
                Locale("es"),
            )
        for (loc in locales) {
            if (engine.setLanguage(loc) != TextToSpeech.LANG_NOT_SUPPORTED) break
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            val voices = engine.voices.orEmpty()
            val best =
                voices
                    .filter { v ->
                        v.locale.language == "es" &&
                            !v.isNetworkConnectionRequired &&
                            v.quality >= Voice.QUALITY_NORMAL
                    }
                    .maxWithOrNull(
                        compareBy<Voice> { if (it.locale.country == "AR") 3 else if (it.locale.country.isNotEmpty()) 2 else 1 }
                            .thenBy { it.quality }
                            .thenBy { if (it.name.contains("local", true)) 1 else 0 },
                    )
            if (best != null) {
                engine.voice = best
            }
        }
        engine.setSpeechRate(0.95f)
        engine.setPitch(1.02f)
    }

    fun speak(text: String, flush: Boolean, utteranceId: String) {
        val line = text.trim()
        if (line.isEmpty() || !ready) return
        val engine = tts ?: return
        val mode = if (flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            engine.speak(line, mode, null, utteranceId)
        } else {
            @Suppress("DEPRECATION")
            engine.speak(line, mode, null)
        }
    }

    fun stop() {
        tts?.stop()
    }

    fun shutdown() {
        tts?.shutdown()
        tts = null
        ready = false
    }

    companion object {
        private const val GOOGLE_ENGINE = "com.google.android.tts"

        /** Abre ajustes de voz Google (instalar / descargar voces offline es-AR). */
        fun openGoogleTtsSettings(context: Context) {
            val intents =
                listOf(
                    Intent("com.android.settings.TTS_SETTINGS"),
                    Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA),
                )
            for (i in intents) {
                i.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                try {
                    context.startActivity(i)
                    return
                } catch (_: Exception) {
                }
            }
        }
    }
}
