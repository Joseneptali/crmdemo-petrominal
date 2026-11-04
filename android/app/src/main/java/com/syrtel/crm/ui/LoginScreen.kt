package com.syrtel.crm.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Mail
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.syrtel.crm.data.ApiException
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(onDone: () -> Unit) {
    val app = app()
    val scope = rememberCoroutineScope()
    var server by remember { mutableStateOf(app.prefs.server) }
    var email by remember { mutableStateOf(app.prefs.email) }
    var password by remember { mutableStateOf("") }
    var showPass by remember { mutableStateOf(false) }
    var showServer by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        if (busy) return
        val url = server.trim().trimEnd('/').let { if (it.startsWith("http")) it else "https://$it" }
        if (!url.startsWith("https://")) { error = "La dirección del CRM debe empezar por https://"; return }
        if (email.isBlank() || password.isBlank()) { error = "Escribe tu correo y tu contraseña"; return }
        busy = true; error = null
        scope.launch {
            try {
                app.api.signIn(url, email, password)
                onDone()
            } catch (e: ApiException) {
                error = e.message
            } catch (e: Exception) {
                error = "No se pudo conectar: ${e.message}"
            } finally {
                busy = false
            }
        }
    }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = MaterialTheme.colorScheme.primary,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
        focusedLeadingIconColor = MaterialTheme.colorScheme.primary,
    )

    Column(
        Modifier.fillMaxSize().background(Tinta).verticalScroll(rememberScrollState()).imePadding()
    ) {
        // Cabecera de marca.
        Column(
            Modifier.fillMaxWidth().statusBarsPadding().padding(top = 48.dp, bottom = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (busy) LogoLoader(96.dp, onDark = true) else LogoMark(96.dp)
            Spacer(Modifier.height(18.dp))
            Text("Syrtel", color = Crema, fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
            Text("CRM", color = NaranjaClaro, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 4.sp)
        }
        // Tarjeta del formulario.
        Surface(
            color = MaterialTheme.colorScheme.background,
            shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp),
            modifier = Modifier.fillMaxWidth().heightIn(min = LocalConfiguration.current.screenHeightDp.dp * 0.62f)
        ) {
            Column(Modifier.padding(horizontal = 24.dp, vertical = 28.dp).navigationBarsPadding()) {
                Text("Bienvenido", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground)
                Text(
                    "Entra con tu usuario del CRM para atender a tus clientes desde el celular.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp, bottom = 22.dp)
                )
                OutlinedTextField(
                    value = email, onValueChange = { email = it },
                    label = { Text("Correo") }, singleLine = true,
                    leadingIcon = { Icon(Icons.Outlined.Mail, null) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                    shape = RoundedCornerShape(16.dp), colors = fieldColors,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password, onValueChange = { password = it },
                    label = { Text("Contraseña") }, singleLine = true,
                    leadingIcon = { Icon(Icons.Outlined.Lock, null) },
                    visualTransformation = if (showPass) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    trailingIcon = {
                        IconButton(onClick = { showPass = !showPass }) {
                            Icon(if (showPass) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, "Mostrar contraseña")
                        }
                    },
                    shape = RoundedCornerShape(16.dp), colors = fieldColors,
                    modifier = Modifier.fillMaxWidth()
                )
                if (showServer) {
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = server, onValueChange = { server = it },
                        label = { Text("Dirección del CRM") }, singleLine = true,
                        leadingIcon = { Icon(Icons.Outlined.Dns, null) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        shape = RoundedCornerShape(16.dp), colors = fieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                ErrorBar(error)
                Spacer(Modifier.height(18.dp))
                Button(
                    onClick = { submit() }, enabled = !busy,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth().height(54.dp)
                ) {
                    Text(if (busy) "Entrando…" else "Entrar", fontSize = 16.sp)
                }
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    TextButton(onClick = { showServer = !showServer }, modifier = Modifier.padding(top = 8.dp)) {
                        Text(
                            if (showServer) "Ocultar dirección del CRM" else "Cambiar dirección del CRM",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
