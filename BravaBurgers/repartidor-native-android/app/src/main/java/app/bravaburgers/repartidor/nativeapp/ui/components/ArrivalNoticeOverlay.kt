package app.bravaburgers.repartidor.nativeapp.ui.components

import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

private val CardBg = Color(0xFF161B22)
private val Green = Color(0xFF2EA44F)
private val White = Color(0xFFFFFFFF)
private val Muted = Color(0xFF8B949E)

/**
 * Modal centrado al entrar a Entrega tras «Llegué». Auto-dismiss 2.5s, sin botón.
 */
@Composable
fun ArrivalNoticeOverlay(
    visible: Boolean,
    title: String = "Aviso enviado",
    message: String = "Notificamos al cliente que estás en la puerta.",
    autoHideMs: Long = 2_500L,
    onDismiss: () -> Unit = {},
) {
    var show by remember { mutableStateOf(false) }
    var badgeAnimCycle by remember { mutableIntStateOf(0) }

    LaunchedEffect(visible) {
        if (visible) {
            badgeAnimCycle += 1
            show = true
            delay(autoHideMs)
            show = false
            onDismiss()
        } else {
            show = false
        }
    }

    AnimatedVisibility(
        visible = show,
        enter = fadeIn(tween(180)),
        exit = fadeOut(tween(320)),
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            // Backdrop blur (API 31+): difumina la pantalla de Entrega debajo.
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .then(
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                Modifier.blur(28.dp)
                            } else {
                                Modifier
                            },
                        )
                        .background(Color(0x59000000)),
            )
            Column(
                modifier =
                    Modifier
                        .width(260.dp)
                        .heightIn(max = 220.dp)
                        .shadow(
                            elevation = 18.dp,
                            shape = RoundedCornerShape(20.dp),
                            spotColor = Green.copy(alpha = 0.45f),
                            ambientColor = Green.copy(alpha = 0.22f),
                        )
                        .clip(RoundedCornerShape(20.dp))
                        .background(CardBg)
                        .border(1.5.dp, Green, RoundedCornerShape(20.dp))
                        .padding(horizontal = 20.dp, vertical = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                ArrivalCheckBadge(animCycle = badgeAnimCycle)
                Text(
                    title,
                    color = White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 16.dp).fillMaxWidth(),
                )
                Text(
                    message,
                    color = Muted,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp).fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun ArrivalCheckBadge(animCycle: Int) {
    val scale = remember { Animatable(0.42f) }
    val checkProgress = remember { Animatable(0f) }

    LaunchedEffect(animCycle) {
        if (animCycle <= 0) return@LaunchedEffect
        scale.snapTo(0.42f)
        checkProgress.snapTo(0f)
        scale.animateTo(
            1f,
            spring(dampingRatio = 0.52f, stiffness = Spring.StiffnessMedium),
        )
        checkProgress.animateTo(1f, tween(420, easing = FastOutSlowInEasing))
    }

    Box(
        modifier =
            Modifier
                .size(72.dp)
                .scale(scale.value)
                .shadow(12.dp, CircleShape, spotColor = Green.copy(alpha = 0.55f))
                .clip(CircleShape)
                .background(Green),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(36.dp)) {
            val path =
                Path().apply {
                    moveTo(size.width * 0.18f, size.height * 0.52f)
                    lineTo(size.width * 0.42f, size.height * 0.74f)
                    lineTo(size.width * 0.84f, size.height * 0.28f)
                }
            val measure = PathMeasure()
            measure.setPath(path, false)
            val length = measure.length
            val dest = Path()
            measure.getSegment(0f, length * checkProgress.value, dest, true)
            drawPath(
                path = dest,
                color = White,
                style =
                    Stroke(
                        width = size.minDimension * 0.12f,
                        cap = StrokeCap.Round,
                        join = StrokeJoin.Round,
                    ),
            )
        }
    }
}
