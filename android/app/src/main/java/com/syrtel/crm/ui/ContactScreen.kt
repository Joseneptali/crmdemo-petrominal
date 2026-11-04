package com.syrtel.crm.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.syrtel.crm.data.ApiException
import com.syrtel.crm.data.ContactDetailResponse
import com.syrtel.crm.data.PatchContactBody
import com.syrtel.crm.data.PatchLeadBody
import com.syrtel.crm.data.Stage
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive

val LOSS_REASONS = listOf(
    "precio" to "Le pareció caro",
    "no_es_perfil" to "No era el perfil",
    "sin_presupuesto" to "Sin presupuesto ahora",
    "eligio_otro" to "Se fue con otro",
    "nunca_contesto" to "Nunca contestó",
    "otro" to "Otro",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactScreen(contactId: String, onBack: () -> Unit, onOpenChat: (String) -> Unit) {
    val app = app()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<ContactDetailResponse?>(null) }
    var stages by remember { mutableStateOf<List<Stage>>(emptyList()) }
    var conversationId by remember { mutableStateOf<String?>(null) }
    var priority by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var notes by remember { mutableStateOf("") }
    var editName by remember { mutableStateOf(false) }
    var lossFor by remember { mutableStateOf<Stage?>(null) }
    var fichaEdit by remember { mutableStateOf<Pair<String, String>?>(null) }
    var showTemplates by remember { mutableStateOf(false) }

    suspend fun load() {
        try {
            val d = app.api.getContact(contactId)
            detail = d
            notes = d.contact.notes.orEmpty()
            runCatching { app.api.getBoard() }.getOrNull()?.let { b ->
                stages = b.stages.sortedBy { it.position }
                priority = b.leads.firstOrNull { it.contact.id == contactId }?.priority
                conversationId = b.leads.firstOrNull { it.contact.id == contactId }?.conversationId
            }
            if (conversationId == null) conversationId = runCatching {
                app.api.getConversations().firstOrNull { it.contact.id == contactId }?.id
            }.getOrNull()
            error = null
        } catch (e: ApiException) { error = e.message }
    }
    LaunchedEffect(contactId) { load() }

    fun run(block: suspend () -> Unit) = scope.launch {
        try { block(); load() } catch (e: ApiException) { error = e.message }
    }

    fun moveTo(stage: Stage, lossReason: String? = null) {
        val leadId = detail?.lead?.id ?: return
        run { app.api.patchLead(leadId, PatchLeadBody(stageId = stage.id, lossReason = lossReason)) }
    }

    val d = detail
    Scaffold(
        topBar = {
            TopAppBar(
                colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(
                    containerColor = Tinta, titleContentColor = Crema,
                    navigationIconContentColor = Crema, actionIconContentColor = Crema
                ),
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") } },
                title = { Text("Ficha del cliente") }
            )
        }
    ) { pad ->
        if (d == null) {
            Column(Modifier.padding(pad)) { ErrorBar(error); if (error == null) Loading() }
            return@Scaffold
        }
        val c = d.contact
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            ErrorBar(error)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(c.name.ifBlank { "?" }, 56.dp)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(c.name.ifBlank { "Sin nombre" }, style = MaterialTheme.typography.titleLarge)
                    Text(c.phone?.let { "+$it" } ?: "Sin teléfono", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { editName = true }) { Icon(Icons.Default.Edit, "Editar nombre") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val conv = conversationId
                if (conv != null) Button(onClick = { onOpenChat(conv) }) {
                    Icon(Icons.Default.Chat, null); Spacer(Modifier.width(6.dp)); Text("Abrir chat")
                } else if (c.phone != null) Button(onClick = { showTemplates = true }) {
                    Icon(Icons.Default.Chat, null); Spacer(Modifier.width(6.dp)); Text("Escribir con plantilla")
                }
                c.phone?.let { p ->
                    OutlinedButton(onClick = { dial(context, p) }) {
                        Icon(Icons.Default.Call, null); Spacer(Modifier.width(6.dp)); Text("Llamar")
                    }
                }
            }

            Section("Etapa del embudo")
            if (d.lead == null || stages.isEmpty()) Text("Este contacto no tiene trato en el embudo.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else Column {
                stages.forEach { s ->
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            if (s.id != d.stage?.id) { if (s.kind == "lost") lossFor = s else moveTo(s) }
                        }.padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(selected = s.id == d.stage?.id, onClick = null)
                        Text(s.name, modifier = Modifier.padding(start = 8.dp))
                        if (s.kind == "won") Chip("Ganado", Verde, Modifier.padding(start = 8.dp))
                        if (s.kind == "lost") Chip("Perdido", Rojo, Modifier.padding(start = 8.dp))
                    }
                }
            }

            if (d.lead != null) {
                Section("Prioridad")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("alta", "media", "baja").forEach { p ->
                        FilterChip(
                            selected = priority == p,
                            onClick = { priority = p; run { app.api.patchLead(d.lead.id, PatchLeadBody(priority = p)) } },
                            label = { Text(p.replaceFirstChar { it.uppercase() }) }
                        )
                    }
                }
            }

            Section("Agente IA")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Pausar el agente para esta persona (la atiende el equipo)",
                    modifier = Modifier.weight(1f), fontSize = 14.sp
                )
                Switch(
                    checked = c.aiPaused == true,
                    onCheckedChange = { v -> run { app.api.patchContact(contactId, PatchContactBody(aiPaused = v)) } }
                )
            }

            Section("Notas del cliente")
            OutlinedTextField(notes, { notes = it }, minLines = 3, modifier = Modifier.fillMaxWidth())
            if (notes != c.notes.orEmpty()) Button(onClick = { run { app.api.patchContact(contactId, PatchContactBody(notes = notes)) } }) {
                Text("Guardar notas")
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Section("Ficha de calificación", Modifier.weight(1f))
                IconButton(onClick = { fichaEdit = "" to "" }) { Icon(Icons.Default.Add, "Agregar dato") }
            }
            val ficha = c.ficha.orEmpty()
            if (ficha.isEmpty()) Text("Nadie ha calificado a este cliente todavía.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            ficha.forEach { (k, v) ->
                val value = runCatching { v.jsonPrimitive.content }.getOrDefault(v.toString())
                Row(
                    Modifier.fillMaxWidth().clickable { fichaEdit = k to value }.padding(vertical = 6.dp)
                ) {
                    Text(k.replace('_', ' ').replaceFirstChar { it.uppercase() }, fontWeight = FontWeight.Medium, modifier = Modifier.weight(0.45f))
                    Text(value, modifier = Modifier.weight(0.55f))
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (editName && d != null) {
        var name by remember { mutableStateOf(d.contact.name) }
        AlertDialog(
            onDismissRequest = { editName = false },
            title = { Text("Nombre del cliente") },
            text = { OutlinedTextField(name, { name = it }, singleLine = true) },
            confirmButton = {
                TextButton(enabled = name.isNotBlank(), onClick = {
                    editName = false
                    run { app.api.patchContact(contactId, PatchContactBody(name = name.trim())) }
                }) { Text("Guardar") }
            },
            dismissButton = { TextButton(onClick = { editName = false }) { Text("Cancelar") } }
        )
    }

    lossFor?.let { stage ->
        AlertDialog(
            onDismissRequest = { lossFor = null },
            title = { Text("¿Por qué se perdió?") },
            text = {
                Column {
                    LOSS_REASONS.forEach { (code, label) ->
                        Text(label, modifier = Modifier.fillMaxWidth().clickable {
                            lossFor = null; moveTo(stage, code)
                        }.padding(vertical = 10.dp))
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { lossFor = null }) { Text("Cancelar") } }
        )
    }

    fichaEdit?.let { (key0, value0) ->
        var key by remember(key0) { mutableStateOf(key0) }
        var value by remember(key0) { mutableStateOf(value0) }
        AlertDialog(
            onDismissRequest = { fichaEdit = null },
            title = { Text(if (key0.isEmpty()) "Nuevo dato" else "Editar dato") },
            text = {
                Column {
                    OutlinedTextField(key, { key = it }, label = { Text("Dato (ej. presupuesto)") }, singleLine = true, enabled = key0.isEmpty())
                    OutlinedTextField(value, { value = it }, label = { Text("Valor") }, modifier = Modifier.padding(top = 8.dp))
                }
            },
            confirmButton = {
                TextButton(enabled = key.isNotBlank() && value.isNotBlank(), onClick = {
                    fichaEdit = null
                    val k = key.trim().lowercase().replace(Regex("\\s+"), "_")
                    val v = value.trim()
                    val prim = v.toLongOrNull()?.let { JsonPrimitive(it) }
                        ?: when (v.lowercase()) { "sí", "si", "true" -> JsonPrimitive(true); "no", "false" -> JsonPrimitive(false); else -> JsonPrimitive(v) }
                    run { app.api.patchContact(contactId, PatchContactBody(ficha = buildJsonObject { put(k, prim) })) }
                }) { Text("Guardar") }
            },
            dismissButton = { TextButton(onClick = { fichaEdit = null }) { Text("Cancelar") } }
        )
    }

    if (showTemplates && d != null) TemplateDialog(
        onDismiss = { showTemplates = false },
        onSend = { t, vars ->
            scope.launch {
                try {
                    val r = app.api.startConversation(contactId, t.id, vars)
                    showTemplates = false
                    r.conversationId?.let(onOpenChat)
                } catch (e: ApiException) { error = e.message; showTemplates = false }
            }
        }
    )
}

@Composable
private fun Section(title: String, modifier: Modifier = Modifier) {
    Text(
        title.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.primary, modifier = modifier.padding(top = 6.dp)
    )
}
