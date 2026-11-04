package com.syrtel.crm.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.syrtel.crm.data.ApiException
import com.syrtel.crm.data.Contact
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun ContactsScreen(onOpen: (String) -> Unit) {
    val app = app()
    val scope = rememberCoroutineScope()
    var q by rememberSaveable { mutableStateOf("") }
    var list by remember { mutableStateOf<List<Contact>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var creating by remember { mutableStateOf(false) }

    // Busca en el CRM (nombre sin acentos o teléfono), con una pausa al teclear.
    LaunchedEffect(q) {
        if (q.isNotEmpty()) delay(350)
        try { list = app.api.getContacts(q); error = null } catch (e: ApiException) { error = e.message }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            ErrorBar(error)
            SearchField(q, { q = it }, "Buscar por nombre o teléfono")
            val l = list
            when {
                l == null && error == null -> Loading()
                l.isNullOrEmpty() -> EmptyState(if (q.isBlank()) "Aún no hay contactos" else "Sin resultados")
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(l, key = { it.id }) { c ->
                        Row(
                            Modifier.fillMaxWidth().clickable { onOpen(c.id) }.padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Avatar(c.name.ifBlank { "?" }, 40.dp)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(c.name.ifBlank { "Sin nombre" }, fontWeight = FontWeight.SemiBold)
                                Text(
                                    c.phone?.let { "+$it" } ?: "Sin teléfono", fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            c.stageName?.let { Chip(it, Verde) }
                            c.priority?.let { Chip(it.replaceFirstChar { ch -> ch.uppercase() }, priorityColor(it), Modifier.padding(start = 4.dp)) }
                        }
                        HorizontalDivider(Modifier.padding(start = 66.dp), color = MaterialTheme.colorScheme.surfaceVariant)
                    }
                }
            }
        }
        FloatingActionButton(
            onClick = { creating = true },
            containerColor = NaranjaBoton, contentColor = androidx.compose.ui.graphics.Color.White,
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)
        ) { Icon(Icons.Default.PersonAdd, "Nuevo contacto") }
    }

    if (creating) NewContactDialog(
        onDismiss = { creating = false },
        onCreate = { name, phone, notes, done ->
            scope.launch {
                try {
                    val c = app.api.createContact(name, phone, notes)
                    creating = false
                    onOpen(c.id)
                } catch (e: ApiException) { done(e.message) }
            }
        }
    )
}

@Composable
fun priorityColor(p: String) = when (p) { "alta" -> Rojo; "media" -> Ambar; else -> Verde }

@Composable
private fun NewContactDialog(onDismiss: () -> Unit, onCreate: (String, String, String?, (String?) -> Unit) -> Unit) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nuevo contacto") },
        text = {
            Column {
                OutlinedTextField(name, { name = it }, label = { Text("Nombre") }, singleLine = true)
                OutlinedTextField(
                    phone, { phone = it.filter { ch -> ch.isDigit() } },
                    label = { Text("Teléfono con código de país") },
                    placeholder = { Text("573001234567") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.padding(top = 8.dp)
                )
                OutlinedTextField(notes, { notes = it }, label = { Text("Notas (opcional)") }, modifier = Modifier.padding(top = 8.dp))
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy && name.isNotBlank() && phone.length in 7..15,
                onClick = {
                    busy = true
                    onCreate(name.trim(), phone, notes.ifBlank { null }) { busy = false; error = it }
                }
            ) { Text("Crear") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )
}
