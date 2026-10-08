package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.HeadsetMic
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.viewmodel.SupportChatLine

private val SheetBg = Color(0xFF161B22)
private val SheetBorder = Color(0xFF21262D)
private val Muted = Color(0xFF8B949E)
private val Orange = Color(0xFFFF6B35)

private val TOPICS =
    listOf(
        "Cliente no atiende",
        "Dirección / GPS",
        "Pago / cobro",
        "Producto / pedido",
        "Otro",
    )

@Composable
fun HandoffSupportOverlay(
    stop: RouteStop,
    sheetOpen: Boolean,
    stepChat: Boolean,
    loading: Boolean,
    error: String?,
    threadClosed: Boolean,
    topic: String?,
    messages: List<SupportChatLine>,
    confirmClose: Boolean,
    onBackdrop: () -> Unit,
    onFabClick: () -> Unit,
    onSelectTopic: (String) -> Unit,
    onMinimize: () -> Unit,
    onRequestClose: () -> Unit,
    onDismissCloseConfirm: () -> Unit,
    onConfirmClose: () -> Unit,
    onSend: (String) -> Unit,
) {
    if (!sheetOpen && !confirmClose) {
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(16.dp),
            contentAlignment = Alignment.BottomEnd,
        ) {
            IconButton(
                onClick = onFabClick,
                modifier =
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .background(Orange)
                        .padding(4.dp),
            ) {
                Icon(Icons.Outlined.HeadsetMic, contentDescription = "Soporte", tint = Color.White)
            }
        }
    }

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
                    .height(520.dp)
                    .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                    .background(SheetBg)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            if (!stepChat) {
                Text("Soporte Brava", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
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
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.padding(16.dp), color = Orange)
                }
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
                            onClick = { onSelectTopic(t) },
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
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onMinimize) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Minimizar", tint = Color.White)
                    }
                    Text(
                        "Soporte",
                        modifier = Modifier.weight(1f),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                    )
                    IconButton(onClick = onRequestClose) {
                        Icon(Icons.Default.Close, contentDescription = "Cerrar chat", tint = Color.White)
                    }
                }
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
                                horizontalArrangement =
                                    if (isOut) Arrangement.End else Arrangement.Start,
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
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
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
