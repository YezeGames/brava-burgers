package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.bravaburgers.repartidor.nativeapp.ui.BravaRidersLogo
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeScreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    loading: Boolean,
    error: String?,
    signupMessage: String?,
    onLogin: (String, String) -> Unit,
    onSignup: (String, String, String, String, String) -> Unit,
) {
    var login by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showSignup by rememberSaveable { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .bravaSafeScreen()
                .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(modifier = Modifier.height(8.dp))
        BravaRidersLogo(size = 120.dp, cornerRadius = 22.dp)
        Text(
            text = "Entrá con tu usuario de cocina",
            color = TextMuted,
            modifier = Modifier.padding(top = 16.dp, bottom = 24.dp),
        )
        val fieldColors =
            OutlinedTextFieldDefaults.colors(
                focusedBorderColor = BravaOrange,
                unfocusedBorderColor = LineDark,
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary,
                cursorColor = BravaOrange,
            )
        OutlinedTextField(
            value = login,
            onValueChange = { login = it },
            label = { Text("Usuario") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            colors = fieldColors,
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Contraseña") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            colors = fieldColors,
        )
        if (!error.isNullOrBlank()) {
            Text(text = error, color = BravaOrange, modifier = Modifier.padding(top = 12.dp))
        }
        if (!signupMessage.isNullOrBlank()) {
            Text(text = signupMessage, color = TextPrimary, modifier = Modifier.padding(top = 12.dp))
        }
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = { onLogin(login.trim(), password) },
            enabled = !loading && login.isNotBlank() && password.isNotBlank(),
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BravaOrange),
        ) {
            if (loading) {
                CircularProgressIndicator()
            } else {
                Text("Entrar")
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedButton(
            onClick = { showSignup = true },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Crear cuenta")
        }
    }

    if (showSignup) {
        ModalBottomSheet(
            onDismissRequest = { showSignup = false },
            sheetState = sheetState,
        ) {
            SignupSheetContent(
                loading = loading,
                onSubmit = { n, a, t, p, p2 ->
                    onSignup(n, a, t, p, p2)
                },
                onClose = { showSignup = false },
            )
        }
    }
}

@Composable
private fun SignupSheetContent(
    loading: Boolean,
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
        Text("Crear cuenta", style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
        Text(
            "Cocina debe aprobar tu solicitud antes de que puedas entrar.",
            color = TextMuted,
            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
        )
        val fieldColors =
            OutlinedTextFieldDefaults.colors(
                focusedBorderColor = BravaOrange,
                unfocusedBorderColor = LineDark,
                cursorColor = BravaOrange,
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
        Spacer(modifier = Modifier.height(20.dp))
        Button(
            onClick = { onSubmit(nombre.trim(), apellido.trim(), tel.trim(), pass, pass2) },
            enabled = !loading && nombre.isNotBlank() && apellido.isNotBlank() && tel.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = BravaOrange),
        ) {
            Text(if (loading) "Enviando…" else "Enviar solicitud")
        }
        OutlinedButton(onClick = onClose, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Text("Cancelar")
        }
    }
}
