package app.bravaburgers.repartidor.nativeapp.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bravaburgers.repartidor.nativeapp.ui.BravaRidersLogoHero
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeScreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary
import app.bravaburgers.repartidor.nativeapp.viewmodel.SignupPendingUi

private val PageBg = Color(0xFF0D1117)
private val CardBg = Color(0xFF161B22)
private val CardBorder = Color(0xFF21262D)
private val InputBg = Color(0xFF0D1117)
private val InputBorder = Color(0xFF30363D)
private val Muted = Color(0xFF8B949E)
private val Orange = Color(0xFFFF6B35)
private val OrangeBtn = Color(0xFFFF5522)
private val Placeholder = Color(0xFF484F58)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    loading: Boolean,
    error: String?,
    signupPending: SignupPendingUi?,
    onClearSignupPending: () -> Unit,
    onLogin: (String, String) -> Unit,
    onSignup: (String, String, String, String, String) -> Unit,
) {
    if (signupPending != null) {
        SignupPendingScreen(pending = signupPending, onBackToLogin = onClearSignupPending)
        return
    }

    var login by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showPass by rememberSaveable { mutableStateOf(false) }
    var showSignup by rememberSaveable { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current

    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(PageBg)
                .bravaSafeScreen(),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(24.dp))
                        .background(CardBg)
                        .border(1.dp, CardBorder, RoundedCornerShape(24.dp))
                        .padding(horizontal = 20.dp, vertical = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                BravaRidersLogoHero()

                Spacer(modifier = Modifier.height(20.dp))

                Text(
                    text = "¡Hola, Rider! 🔥",
                    color = TextPrimary,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.ExtraBold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = "Ingresá con tu usuario para iniciar jornada",
                    color = Muted,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp, bottom = 28.dp),
                )

                LoginFieldBlock(label = "Usuario") {
                    LoginInputShell(
                        value = login,
                        onValueChange = { login = it },
                        placeholder = "Ezequiel",
                        leading = {
                            Icon(
                                Icons.Outlined.Person,
                                contentDescription = null,
                                tint = Orange,
                                modifier = Modifier.size(20.dp),
                            )
                        },
                    )
                }

                LoginFieldBlock(label = "Contraseña") {
                    LoginInputShell(
                        value = password,
                        onValueChange = { password = it },
                        placeholder = "••••••••",
                        visualTransformation =
                            if (showPass) VisualTransformation.None else PasswordVisualTransformation(),
                        leading = {
                            Icon(
                                Icons.Outlined.Lock,
                                contentDescription = null,
                                tint = Orange,
                                modifier = Modifier.size(20.dp),
                            )
                        },
                        trailing = {
                            IconButton(
                                onClick = { showPass = !showPass },
                                modifier = Modifier.size(36.dp),
                            ) {
                                Icon(
                                    if (showPass) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                    contentDescription = "Mostrar contraseña",
                                    tint = Muted,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        },
                    )
                }

                TextButton(
                    onClick = {
                        Toast.makeText(
                            context,
                            "Pedí una nueva clave a cocina desde el local.",
                            Toast.LENGTH_LONG,
                        ).show()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        "¿Olvidaste tu contraseña?",
                        color = Muted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }

                if (!error.isNullOrBlank()) {
                    Text(
                        text = error,
                        color = OrangeBtn,
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    )
                }
                Button(
                    onClick = { onLogin(login.trim(), password) },
                    enabled = !loading && login.isNotBlank() && password.isNotBlank(),
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp)
                            .shadow(8.dp, RoundedCornerShape(14.dp), spotColor = Color(0x59FF5522)),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrangeBtn),
                ) {
                    if (loading) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(22.dp))
                    } else {
                        Text("Entrar", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 22.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    HorizontalDivider(modifier = Modifier.weight(1f), color = CardBorder)
                    Text("ó", color = Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 12.dp))
                    HorizontalDivider(modifier = Modifier.weight(1f), color = CardBorder)
                }

                OutlinedButton(
                    onClick = { showSignup = true },
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, Orange),
                    colors =
                        ButtonDefaults.outlinedButtonColors(
                            containerColor = InputBg,
                            contentColor = Orange,
                        ),
                ) {
                    Text("Crear cuenta", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    if (showSignup) {
        ModalBottomSheet(
            onDismissRequest = { showSignup = false },
            sheetState = sheetState,
            containerColor = CardBg,
        ) {
            SignupSheetContent(
                loading = loading,
                error = error,
                onSubmit = { n, a, t, p, p2 ->
                    onSignup(n, a, t, p, p2)
                },
                onClose = { showSignup = false },
            )
        }
    }
}

@Composable
private fun SignupPendingScreen(
    pending: SignupPendingUi,
    onBackToLogin: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(PageBg)
                .bravaSafeScreen()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier =
                Modifier
                    .size(72.dp)
                    .shadow(8.dp, RoundedCornerShape(18.dp), spotColor = Color(0x59FF6B35))
                    .clip(RoundedCornerShape(18.dp))
                    .background(PageBg)
                    .border(2.dp, Orange, RoundedCornerShape(18.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Outlined.Schedule,
                contentDescription = null,
                tint = Orange,
                modifier = Modifier.size(32.dp),
            )
        }

        Text(
            text = "Solicitud enviada",
            color = TextPrimary,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 16.dp),
        )
        Text(
            text = "Cocina debe aprobar tu cuenta antes de que puedas entrar. Si aprueban, usás tu usuario y la contraseña que elegiste.",
            color = Muted,
            fontSize = 13.sp,
            lineHeight = 19.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp, bottom = 20.dp),
        )

        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(CardBg)
                    .border(1.dp, CardBorder, RoundedCornerShape(14.dp))
                    .padding(14.dp),
        ) {
            PendingRow(label = "Nombre", value = pending.displayName())
            PendingRow(label = "Teléfono", value = pending.telefono)
            PendingRow(label = "Contraseña", value = "Elegida por vos (se activa al aprobar)")
            PendingRow(label = "Estado", value = "Pendiente", valueColor = OrangeBtn)
            PendingRow(label = "Usuario propuesto", value = "@${pending.login}")
        }

        TextButton(onClick = onBackToLogin, modifier = Modifier.padding(top = 24.dp)) {
            Text("Volver al login", color = Orange, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        }
    }
}

@Composable
private fun PendingRow(
    label: String,
    value: String,
    valueColor: Color = TextPrimary,
) {
    Text(
        text = label.uppercase(),
        color = Muted,
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 8.dp),
    )
    Text(
        text = value,
        color = valueColor,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
    )
}

@Composable
private fun LoginFieldBlock(
    label: String,
    content: @Composable () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 22.dp)) {
        Text(
            text = label.uppercase(),
            color = Muted,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        )
        content()
    }
}

@Composable
private fun LoginInputShell(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    leading: @Composable (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
) {
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(54.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(InputBg)
                .border(1.dp, InputBorder, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (leading != null) {
                Box(modifier = Modifier.width(28.dp), contentAlignment = Alignment.Center) {
                    leading()
                }
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.weight(1f),
                singleLine = true,
                textStyle =
                    TextStyle(
                        color = TextPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Center,
                    ),
                visualTransformation = visualTransformation,
                cursorBrush = SolidColor(Orange),
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.Center) {
                        if (value.isEmpty()) {
                            Text(placeholder, color = Placeholder, fontSize = 15.sp, textAlign = TextAlign.Center)
                        }
                        inner()
                    }
                },
            )
            if (trailing != null) {
                trailing()
            } else {
                Spacer(modifier = Modifier.width(36.dp))
            }
        }
    }
}

@Composable
private fun SignupSheetContent(
    loading: Boolean,
    error: String?,
    onSubmit: (String, String, String, String, String) -> Unit,
    onClose: () -> Unit,
) {
    var nombre by rememberSaveable { mutableStateOf("") }
    var apellido by rememberSaveable { mutableStateOf("") }
    var tel by rememberSaveable { mutableStateOf("") }
    var pass by rememberSaveable { mutableStateOf("") }
    var pass2 by rememberSaveable { mutableStateOf("") }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 8.dp)
                .padding(bottom = 32.dp),
    ) {
        Text("Crear cuenta", color = TextPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Text(
            "Completá tus datos y elegí tu contraseña. Cocina aprueba o rechaza desde el panel.",
            color = Muted,
            fontSize = 13.sp,
            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
        )
        val fieldColors =
            OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Orange,
                unfocusedBorderColor = InputBorder,
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary,
                cursorColor = Orange,
            )
        OutlinedTextField(
            value = nombre,
            onValueChange = { nombre = it },
            label = { Text("Nombre") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            colors = fieldColors,
        )
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
            value = apellido,
            onValueChange = { apellido = it },
            label = { Text("Apellido") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            colors = fieldColors,
        )
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
            value = tel,
            onValueChange = { tel = it },
            label = { Text("Teléfono") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            colors = fieldColors,
        )
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
            value = pass,
            onValueChange = { pass = it },
            label = { Text("Contraseña") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            colors = fieldColors,
        )
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
            value = pass2,
            onValueChange = { pass2 = it },
            label = { Text("Confirmar contraseña") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            colors = fieldColors,
        )
        if (!error.isNullOrBlank()) {
            Text(
                text = error,
                color = OrangeBtn,
                fontSize = 12.sp,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        Button(
            onClick = { onSubmit(nombre.trim(), apellido.trim(), tel.trim(), pass, pass2) },
            enabled = !loading && nombre.isNotBlank() && apellido.isNotBlank() && tel.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = OrangeBtn),
        ) {
            Text(if (loading) "Enviando…" else "Enviar solicitud", fontWeight = FontWeight.Bold)
        }
        OutlinedButton(onClick = onClose, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Text("Cancelar")
        }
    }
}
