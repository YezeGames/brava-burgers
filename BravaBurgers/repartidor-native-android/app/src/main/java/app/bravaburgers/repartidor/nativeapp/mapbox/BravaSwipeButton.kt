package app.bravaburgers.repartidor.nativeapp.mapbox

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import android.view.Gravity
import android.view.MotionEvent
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView

/**
 * Swipe de llegada al domicilio del cliente (solo navegación / Mapbox).
 * La confirmación "Entregado" sigue en [app.bravaburgers.repartidor.nativeapp.ui.screens.HandoffScreen].
 */
class BravaSwipeButton
    @JvmOverloads
    constructor(
        context: Context,
        attrs: AttributeSet? = null,
    ) : FrameLayout(context, attrs) {
        private val trackLabel = TextView(context)
        private val thumb = FrameLayout(context)
        private val thumbIcon = ImageView(context)
        private var confirmed = false
        private var dragStartX = 0f
        private var thumbStartX = 0f
        var onConfirmed: (() -> Unit)? = null

        init {
            val density = resources.displayMetrics.density
            val pad = (6 * density).toInt()
            val trackBg =
                GradientDrawable().apply {
                    cornerRadius = 28 * density
                    setColor(Color.parseColor("#121212"))
                }
            background = trackBg

            trackLabel.text = "Llegué a destino"
            trackLabel.gravity = Gravity.CENTER
            trackLabel.setTextColor(Color.parseColor("#A0A0A0"))
            trackLabel.textSize = 15f
            addView(trackLabel, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

            val thumbSize = (52 * density).toInt()
            val thumbBg =
                GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#FF5722"))
                }
            thumb.background = thumbBg
            thumbIcon.setImageResource(app.bravaburgers.repartidor.nativeapp.R.drawable.ic_brava_swipe_arrow_forward)
            thumbIcon.scaleType = ImageView.ScaleType.CENTER_INSIDE
            val iconPad = (14 * density).toInt()
            thumb.addView(
                thumbIcon,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT).apply {
                    setMargins(iconPad, iconPad, iconPad, iconPad)
                },
            )
            val lp = LayoutParams(thumbSize, thumbSize)
            lp.gravity = Gravity.START or Gravity.CENTER_VERTICAL
            lp.marginStart = pad
            addView(thumb, lp)
        }

        override fun onSizeChanged(
            w: Int,
            h: Int,
            oldw: Int,
            oldh: Int,
        ) {
            super.onSizeChanged(w, h, oldw, oldh)
            if (!confirmed) {
                thumb.translationX = 0f
                updateLabelFade()
            }
        }

        private fun maxTravel(): Float {
            val pad = 6 * resources.displayMetrics.density
            return (width - thumb.width - pad * 2).coerceAtLeast(0f)
        }

        private fun updateLabelFade() {
            val max = maxTravel()
            val progress =
                if (max <= 0f) {
                    0f
                } else {
                    (thumb.translationX / max).coerceIn(0f, 1f)
                }
            trackLabel.alpha = 1f - progress * 0.92f
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
                    updateLabelFade()
                    return true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (thumb.translationX >= maxTravel() * 0.82f) {
                        confirmed = true
                        thumb.translationX = maxTravel()
                        trackLabel.alpha = 0f
                        onConfirmed?.invoke()
                    } else {
                        thumb.animate().translationX(0f).setDuration(180).withEndAction {
                            updateLabelFade()
                        }.start()
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
