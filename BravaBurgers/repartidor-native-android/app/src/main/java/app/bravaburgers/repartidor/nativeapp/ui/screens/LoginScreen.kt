package app.bravaburgers.repartidor.nativeapp.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.bravaburgers.repartidor.nativeapp.ui.BravaRidersLogo
import app.bravaburgers.repartidor.nativeapp.ui.bravaSafeScreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaOrange
import app.bravaburgers.repartidor.nativeapp.ui.theme.LineDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.SurfaceDark
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextMuted
import app.bravaburgers.repartidor.nativeapp.ui.theme.TextPrimary

@Composable
fun LoginScreen(
    loading: Boolean,
    error: String?,
    onLogin: (String, String) -> Unit,
) {
    var login by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }

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
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = { onLogin(login.trim(), password) },
            enabled = !loading && login.isNotBlank() && password.isNotBlank(),
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BravaOrange),
        ) {
            if (loading) {
                CircularProgressIndicator()
            } else {
                Text("Entrar")
            }
        }
    }
}
