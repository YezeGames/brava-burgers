package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeBottom
import app.bravaburgers.repartidor.nativeapp.viewmodel.SupportChatLine

private val SheetBg = Color(0xFF161B22)
private val SheetBorder = Color(0xFF21262D)
private val Muted = Color(0xFF8B949E)
private val Orange = Color(0xFFFF6B35)
private val SheetHeight = 520.dp

private val TOPICS =
    listOf(
        "Cliente no atiende",
        "Inconveniente con el cobro",
        "Producto / pedido",
        "Otro",
    )

@Composable
fun HandoffSupportOverlay(
    stop: RouteStop,
    sheetOpen: Boolean,
    stepChat: Boolean,
    stepConnecting: Boolean,
    loading: Boolean,
    error: String?,
    threadClosed: Boolean,
    topic: String?,
    messages: List<SupportChatLine>,
    confirmClose: Boolean,
    onBackdrop: () -> Unit,
    onSelectTopic: (String) -> Unit,
    onMinimize: () -> Unit,
    onRequestClose: () -> Unit,
    onDismissCloseConfirm: () -> Unit,
    onConfirmClose: () -> Unit,
    onSend: (String) -> Unit,
) {
    if (!sheetOpen) {
        if (confirmClose) {
            AlertDialog(
                onDismissRequest = onDismissCloseConfirm,
                title = { Text("¿Cerrar chat?") },
                text = {
                    Text("Se avisa a cocina en el panel Soporte. Después no podés enviar más mensajes en este pedido.")
                },
                confirmButton = {
                    TextButton(onClick = onConfirmClose) { Text("Cerrar chat") }
                },
                dismissButton = {
                    TextButton(onClick = onDismissCloseConfirm) { Text("Cancelar") }
                },
            )
        }
        return
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.45f))
                    .clickable(onClick = onBackdrop),
        )
        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(SheetHeight)
                    .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                    .background(SheetBg)
                    .bravaSafeBottom()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            when {
                stepConnecting -> SupportConnectingPane(topic = topic, loading = loading, onMinimize = onMinimize)
                stepChat -> SupportChatPane(
                    stop = stop,
                    topic = topic,
                    threadClosed = threadClosed,
                    messages = messages,
                    onMinimize = onMinimize,
                    onRequestClose = onRequestClose,
                    onSend = onSend,
                )
                else -> SupportTopicsPane(
                    stop = stop,
                    loading = loading,
                    error = error,
                    onMinimize = onMinimize,
                    onSelectTopic = onSelectTopic,
                )
            }
        }
    }

    if (confirmClose) {
        AlertDialog(
            onDismissRequest = onDismissCloseConfirm,
            title = { Text("¿Cerrar chat?") },
            text = {
                Text("Se avisa a cocina en el panel Soporte. Después no podés enviar más mensajes en este pedido.")
            },
            confirmButton = {
                TextButton(onClick = onConfirmClose) { Text("Cerrar chat") }
            },
            dismissButton = {
                TextButton(onClick = onDismissCloseConfirm) { Text("Cancelar") }
            },
        )
    }
}

@Composable
private fun SupportSheetHeader(
    title: String,
    onMinimize: () -> Unit,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, modifier = Modifier.weight(1f), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        trailing?.invoke()
        IconButton(onClick = onMinimize) {
            Icon(Icons.Default.Close, contentDescription = "Minimizar", tint = Color.White)
        }
    }
}

@Composable
private fun ColumnScope.SupportTopicsPane(
    stop: RouteStop,
    loading: Boolean,
    error: String?,
    onMinimize: () -> Unit,
    onSelectTopic: (String) -> Unit,
) {
    SupportSheetHeader(title = "Soporte Brava", onMinimize = onMinimize)
    Text(
        "Elegí el motivo. Se abre un chat con cocina para este pedido.",
        color = Muted,
        fontSize = 13.sp,
        modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
    )
    Text(
        "${stop.orn} · Parada ${stop.parada ?: "?"} · ${stop.cliente.orEmpty()}",
        color = Orange,
        fontSize = 12.sp,
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFF0D1117))
                .padding(10.dp),
    )
    error?.let {
        Text(it, color = Orange, fontSize = 13.sp, modifier = Modifier.padding(vertical = 8.dp))
    }
    Column(
        modifier =
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TOPICS.forEach { t ->
            TextButton(
                onClick = { if (!loading) onSelectTopic(t) },
                enabled = !loading,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF0D1117)),
            ) {
                Text(t, color = Color.White, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun ColumnScope.SupportConnectingPane(
    topic: String?,
    loading: Boolean,
    onMinimize: () -> Unit,
) {
    SupportSheetHeader(title = "Conectando con Soporte", onMinimize = onMinimize)
    Box(
        modifier =
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color(0xFF1A2332), Color(0xFF0D1117), Color(0xFF161B22)),
                    ),
                )
                .padding(16.dp),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val step = 28f
            var y = 0f
            while (y < size.height) {
                var x = 0f
                while (x < size.width) {
                    drawCircle(
                        color = Color.White.copy(alpha = 0.04f),
                        radius = 2.2f,
                        center = Offset(x, y),
                    )
                    x += step
                }
                y += step
            }
        }
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                topic.orEmpty().ifBlank { "Soporte" },
                color = Orange,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                modifier =
                    Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFF21262D))
                        .padding(horizontal = 14.dp, vertical = 8.dp),
            )
            Spacer(modifier = Modifier.height(20.dp))
            CircularProgressIndicator(modifier = Modifier.size(42.dp), color = Orange, strokeWidth = 3.dp)
            Spacer(modifier = Modifier.height(16.dp))
            Text("En fila activa", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Text("Tiempo estimado ~2 min", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
            if (!loading) {
                Text("Abriendo chat…", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
            }
        }
    }
}

@Composable
private fun ColumnScope.SupportChatPane(
    stop: RouteStop,
    topic: String?,
    threadClosed: Boolean,
    messages: List<SupportChatLine>,
    onMinimize: () -> Unit,
    onRequestClose: () -> Unit,
    onSend: (String) -> Unit,
) {
    SupportSheetHeader(
        title = "Soporte",
        onMinimize = onMinimize,
        trailing = {
            if (!threadClosed) {
                TextButton(onClick = onRequestClose) {
                    Text("Cerrar chat", color = Muted, fontSize = 12.sp)
                }
            }
        },
    )
    Text(
        "${topic.orEmpty()} · ${stop.orn}",
        color = Muted,
        fontSize = 12.sp,
        modifier = Modifier.padding(bottom = 8.dp),
    )
    if (threadClosed) {
        Text(
            "Chat cerrado. No podés enviar más mensajes en este pedido.",
            color = Orange,
            fontSize = 12.sp,
            modifier = Modifier.padding(bottom = 8.dp),
        )
    }
    Column(
        modifier =
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        messages.forEach { m ->
            val isSys = m.sender == "system"
            val isOut = m.sender == "admin"
            if (isSys) {
                Text(
                    m.body,
                    color = Muted,
                    fontSize = 11.sp,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (isOut) Arrangement.End else Arrangement.Start,
                ) {
                    Box(
                        modifier =
                            Modifier
                                .fillMaxWidth(0.88f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (isOut) Color(0xFF238636) else Color(0xFF0D1117))
                                .padding(10.dp),
                    ) {
                        Text(m.body, color = Color.White, fontSize = 14.sp)
                    }
                }
            }
        }
    }
    if (!threadClosed) {
        var draft by remember { mutableStateOf("") }
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Escribí a cocina…") },
                maxLines = 3,
            )
            TextButton(
                onClick = {
                    onSend(draft)
                    draft = ""
                },
                enabled = draft.isNotBlank(),
            ) {
                Text("Enviar", color = Orange)
            }
        }
    }
}
