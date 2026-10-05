package app.bravaburgers.repartidor.nativeapp.mapbox

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import app.bravaburgers.repartidor.nativeapp.R
/**
 * Deslizá a la derecha para confirmar llegada (estilo demo Brava).
 */
class BravaSwipeLlegueView
    @JvmOverloads
    constructor(
        context: Context,
        attrs: AttributeSet? = null,
    ) : FrameLayout(context, attrs) {
        private val track = TextView(context)
        private val thumb = TextView(context)
        private var confirmed = false
        private var dragStartX = 0f
        private var thumbStartX = 0f
        var onConfirmed: (() -> Unit)? = null

        init {
            val pad = (14 * resources.displayMetrics.density).toInt()
            val trackBg =
                GradientDrawable().apply {
                    cornerRadius = 28 * resources.displayMetrics.density
                    setColor(0x33FF6B35)
                }
            background = trackBg
            track.text = "Deslizá para confirmar llegada →"
            track.gravity = Gravity.CENTER
            track.setTextColor(0xCCFFFFFF.toInt())
            track.textSize = 14f
            addView(track, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

            val thumbBg =
                GradientDrawable().apply {
                    cornerRadius = 24 * resources.displayMetrics.density
                    setColor(ContextCompat.getColor(context, R.color.brava_orange))
                }
            thumb.background = thumbBg
            thumb.text = "Llegué"
            thumb.gravity = Gravity.CENTER
            thumb.setTextColor(0xFFFFFFFF.toInt())
            thumb.textSize = 15f
            thumb.setTypeface(thumb.typeface, android.graphics.Typeface.BOLD)
            val thumbW = (120 * resources.displayMetrics.density).toInt()
            val thumbH = (48 * resources.displayMetrics.density).toInt()
            val lp = LayoutParams(thumbW, thumbH)
            lp.gravity = Gravity.START or Gravity.CENTER_VERTICAL
            lp.marginStart = pad / 2
            addView(thumb, lp)
        }

        override fun onSizeChanged(
            w: Int,
            h: Int,
            oldw: Int,
            oldh: Int,
        ) {
            super.onSizeChanged(w, h, oldw, oldh)
            resetThumb()
        }

        private fun resetThumb() {
            if (confirmed) return
            thumb.translationX = 0f
        }

        private fun maxTravel(): Float {
            val pad = (14 * resources.displayMetrics.density)
            return (width - thumb.width - pad * 1.5f).coerceAtLeast(0f)
        }

        override fun onTouchEvent(event: MotionEvent): Boolean {
            if (confirmed) return true
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    if (!hitThumb(event.x, event.y)) return false
                    dragStartX = event.x
                    thumbStartX = thumb.translationX
                    parent.requestDisallowInterceptTouchEvent(true)
                    return true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.x - dragStartX
                    thumb.translationX = (thumbStartX + dx).coerceIn(0f, maxTravel())
                    return true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (thumb.translationX >= maxTravel() * 0.82f) {
                        confirmed = true
                        thumb.translationX = maxTravel()
                        track.text = "¡Listo!"
                        onConfirmed?.invoke()
                    } else {
                        thumb.animate().translationX(0f).setDuration(180).start()
                    }
                    return true
                }
            }
            return super.onTouchEvent(event)
        }

        private fun hitThumb(
            x: Float,
            y: Float,
        ): Boolean {
            val left = thumb.left + thumb.translationX
            val top = thumb.top.toFloat()
            return x >= left && x <= left + thumb.width && y >= top && y <= top + thumb.height
        }

        override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
            if (confirmed) return true
            if (ev.actionMasked == MotionEvent.ACTION_DOWN && hitThumb(ev.x, ev.y)) {
                return true
            }
            return super.onInterceptTouchEvent(ev)
        }
    }
