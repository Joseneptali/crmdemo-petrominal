package com.syrtel.crm.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import com.syrtel.crm.data.ApiException
import com.syrtel.crm.data.Conversation
import com.syrtel.crm.data.Message
import com.syrtel.crm.data.MessageMedia
import com.syrtel.crm.data.MessageNewEvent
import com.syrtel.crm.data.Nota
import com.syrtel.crm.data.PatchConversationBody
import com.syrtel.crm.data.RespuestaRapida
import com.syrtel.crm.data.Template
import com.syrtel.crm.data.json
import com.syrtel.crm.notify.Notifier
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.jsonPrimitive

@OptIn(ExperimentalMaterial3Api::class, FlowPreview::class)
@Composable
fun ChatScreen(conversationId: String, onBack: () -> Unit, onOpenContact: (String) -> Unit) {
    val app = app()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var conv by remember { mutableStateOf<Conversation?>(null) }
    var messages by remember { mutableStateOf<List<Message>?>(null) }
    var notas by remember { mutableStateOf<List<Nota>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var tab by remember { mutableIntStateOf(0) }
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var replyTo by remember { mutableStateOf<Message?>(null) }
    var menu by remember { mutableStateOf(false) }
    var showQuick by remember { mutableStateOf(false) }
    var showTemplates by remember { mutableStateOf(false) }
    var pendingFile by remember { mutableStateOf<Uri?>(null) }

    suspend fun loadConv() {
        runCatching { app.api.getConversations().firstOrNull { it.id == conversationId } }
            .onSuccess { conv = it ?: conv }
    }
    suspend fun loadMessages() {
        try { messages = app.api.getMessages(conversationId); error = null } catch (e: ApiException) { error = e.message }
    }
    suspend fun loadNotas() { runCatching { notas = app.api.getNotas(conversationId) } }
    suspend fun markRead() { runCatching { app.api.patchConversation(conversationId, PatchConversationBody(markRead = true)) } }

    // Mientras está abierta, esta conversación no genera notificaciones.
    DisposableEffect(conversationId) {
        app.notifier.openConversationId = conversationId
        app.notifier.cancel(conversationId)
        onDispose { if (app.notifier.openConversationId == conversationId) app.notifier.openConversationId = null }
    }

    LaunchedEffect(conversationId) {
        launch { loadConv() }
        launch { loadNotas() }
        loadMessages()
        markRead()
    }

    // Mensaje nuevo de esta conversación: se agrega al momento.
    LaunchedEffect(conversationId) {
        app.live.events.filter { it.type == "message.new" }.collect { ev ->
            val e = runCatching { json.decodeFromString<MessageNewEvent>(ev.data) }.getOrNull() ?: return@collect
            if (e.conversationId != conversationId) return@collect
            val cur = messages.orEmpty()
            if (cur.none { it.id == e.message.id }) messages = cur + e.message
            if (e.message.incoming) { markRead(); loadConv() }
        }
    }
    // Estados de entrega, adjuntos listos, notas y cambios de la conversación.
    LaunchedEffect(conversationId) {
        app.live.events
            .filter { it.data.contains(conversationId) || it.type == "reconnected" }
            .filter { it.type != "message.new" }
            .debounce(300)
            .collect { ev ->
                when (ev.type) {
                    "message.status", "message.media" -> loadMessages()
                    "note.new", "note.deleted" -> loadNotas()
                    "conversation.updated" -> loadConv()
                    "conversation.deleted" -> onBack()
                    "reconnected" -> { loadConv(); loadMessages(); loadNotas() }
                }
            }
    }

    fun patch(body: PatchConversationBody) = scope.launch {
        try { app.api.patchConversation(conversationId, body)?.let { conv = it } } catch (e: ApiException) { error = e.message }
    }

    fun send() {
        val text = draft.trim()
        if (text.isEmpty() || sending) return
        sending = true
        scope.launch {
            try {
                app.api.sendText(conversationId, text, replyTo?.id)
                draft = ""; replyTo = null; error = null
                loadMessages()
            } catch (e: ApiException) {
                error = e.message
            } finally { sending = false }
        }
    }

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) pendingFile = uri
    }

    val c = conv
    val name = c?.contact?.name?.ifBlank { null } ?: c?.contact?.phone?.let { "+$it" } ?: "Conversación"

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") } },
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable(enabled = c != null) { c?.let { onOpenContact(it.contact.id) } }
                    ) {
                        Avatar(name, 36.dp)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 17.sp)
                            if (c != null) Text(
                                subtitle(c), fontSize = 12.sp, maxLines = 1,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    if (c != null) {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, "Opciones") }
                        DropdownMenu(menu, { menu = false }) {
                            if (c.aiEnabled && !c.needsHuman) DropdownMenuItem(
                                text = { Text("Tomar conversación (pausar agente)") },
                                onClick = { menu = false; patch(PatchConversationBody(aiEnabled = false)) }
                            )
                            if (!c.aiEnabled || c.needsHuman) DropdownMenuItem(
                                text = { Text("Devolver al agente IA") },
                                leadingIcon = { Icon(Icons.Default.SmartToy, null) },
                                onClick = { menu = false; patch(PatchConversationBody(reactivate = true)) }
                            )
                            if (c.needsHuman) DropdownMenuItem(
                                text = { Text("Marcar atendida (sigo yo)") },
                                onClick = { menu = false; patch(PatchConversationBody(reactivate = true, aiEnabled = false)) }
                            )
                            DropdownMenuItem(text = { Text("Ver ficha del cliente") }, onClick = { menu = false; onOpenContact(c.contact.id) })
                            c.contact.phone?.let { phone ->
                                DropdownMenuItem(text = { Text("Llamar") }, onClick = { menu = false; dial(context, phone) })
                            }
                        }
                    }
                }
            )
        }
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().imePadding()) {
            TabRow(selectedTabIndex = tab) {
                Tab(tab == 0, { tab = 0 }, text = { Text("Chat") })
                Tab(tab == 1, { tab = 1 }, text = { Text(if (notas.isEmpty()) "Notas internas" else "Notas internas (${notas.size})") })
            }
            ErrorBar(error)
            if (c != null && c.needsHuman) Banner(
                "El agente pidió ayuda" + (c.handoffReason?.let { ": $it" } ?: ""),
                Rojo, "Marcar atendida"
            ) { patch(PatchConversationBody(reactivate = true, aiEnabled = false)) }
            else if (c != null && c.aiEnabled) Banner("El agente IA está respondiendo esta conversación", Acento, "Tomarla") {
                patch(PatchConversationBody(aiEnabled = false))
            }

            if (tab == 0) {
                Box(Modifier.weight(1f)) {
                    val list = messages
                    if (list == null) Loading()
                    else if (list.isEmpty()) EmptyState("Sin mensajes todavía")
                    else MessageList(list, onReply = { if (c?.composer?.quoteReply != false) replyTo = it })
                }
                if (c != null && !c.canReply) {
                    Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
                        Column(Modifier.fillMaxWidth().padding(12.dp).navigationBarsPadding()) {
                            Text(
                                "Pasaron más de 24 h desde el último mensaje del cliente. Solo puedes escribirle con una plantilla aprobada.",
                                fontSize = 13.sp
                            )
                            if (c.channel == "whatsapp") Button(onClick = { showTemplates = true }, modifier = Modifier.padding(top = 8.dp)) {
                                Text("Enviar plantilla")
                            }
                        }
                    }
                } else {
                    Composer(
                        draft = draft, onDraft = { draft = it }, sending = sending,
                        replyTo = replyTo, onCancelReply = { replyTo = null },
                        canAttach = c?.composer?.media != false,
                        onAttach = { pickFile.launch("*/*") },
                        onQuick = { showQuick = true },
                        onSend = { send() }
                    )
                }
            } else {
                NotasTab(notas, conversationId, onChanged = { scope.launch { loadNotas() } }, onError = { error = it })
            }
        }
    }

    if (showQuick) QuickRepliesSheet(onDismiss = { showQuick = false }, onPick = { draft = it.texto; showQuick = false })
    if (showTemplates) TemplateDialog(
        onDismiss = { showTemplates = false },
        onSend = { t, vars ->
            scope.launch {
                try {
                    app.api.sendTemplate(conversationId, t.id, vars)
                    showTemplates = false; loadMessages()
                } catch (e: ApiException) { error = e.message; showTemplates = false }
            }
        }
    )
    pendingFile?.let { uri ->
        var caption by remember(uri) { mutableStateOf("") }
        var busy by remember(uri) { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { if (!busy) pendingFile = null },
            title = { Text("Enviar archivo") },
            text = {
                Column {
                    Text(uri.lastPathSegment ?: "Archivo", fontSize = 13.sp, maxLines = 2)
                    OutlinedTextField(caption, { caption = it }, label = { Text("Texto (opcional)") }, modifier = Modifier.padding(top = 8.dp))
                }
            },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    busy = true
                    scope.launch {
                        try { app.api.sendMedia(conversationId, uri, caption); loadMessages() }
                        catch (e: ApiException) { error = e.message }
                        finally { busy = false; pendingFile = null }
                    }
                }) { Text(if (busy) "Enviando…" else "Enviar") }
            },
            dismissButton = { TextButton(enabled = !busy, onClick = { pendingFile = null }) { Text("Cancelar") } }
        )
    }
}

private fun subtitle(c: Conversation): String = buildList {
    add(channelLabel(c.channel))
    when {
        c.windowOpen -> add("ventana ${remaining(c.windowRemainingMs)}")
        c.humanWindow?.open == true -> add("ventana humana ${remaining(c.humanWindow?.remainingMs ?: 0)}")
        else -> add("ventana cerrada")
    }
    c.stageName?.let { add(it) }
}.joinToString(" · ")

@Composable
private fun Banner(text: String, color: Color, action: String, onAction: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(color.copy(alpha = 0.10f)).padding(start = 14.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text, color = color, fontSize = 13.sp, modifier = Modifier.weight(1f).padding(vertical = 8.dp))
        TextButton(onClick = onAction) { Text(action) }
    }
}

@Composable
private fun MessageList(messages: List<Message>, onReply: (Message) -> Unit) {
    val state = rememberLazyListState()
    val reversed = remember(messages) { messages.sortedBy { it.createdAt }.reversed() }
    LaunchedEffect(messages.size) { state.animateScrollToItem(0) }
    LazyColumn(
        state = state, reverseLayout = true,
        modifier = Modifier.fillMaxSize().padding(horizontal = 10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        items(reversed.size, key = { reversed[it].id }) { i ->
            val m = reversed[i]
            val older = reversed.getOrNull(i + 1)
            Column {
                if (older == null || dayLabel(older.createdAt) != dayLabel(m.createdAt)) {
                    Text(
                        dayLabel(m.createdAt), fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.align(Alignment.CenterHorizontally).padding(vertical = 8.dp)
                    )
                }
                Bubble(m, onReply)
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Bubble(m: Message, onReply: (Message) -> Unit) {
    val context = LocalContext.current
    val app = app()
    val scope = rememberCoroutineScope()
    var menu by remember { mutableStateOf(false) }
    val mine = !m.incoming
    val bg = if (mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
    Box(Modifier.fillMaxWidth(), contentAlignment = if (mine) Alignment.CenterEnd else Alignment.CenterStart) {
        Surface(
            color = bg,
            shape = RoundedCornerShape(16.dp, 16.dp, if (mine) 4.dp else 16.dp, if (mine) 16.dp else 4.dp),
            tonalElevation = 1.dp,
            modifier = Modifier.widthIn(max = 300.dp).combinedClickable(onClick = {}, onLongClick = { menu = true })
        ) {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
                if (mine && (m.aiGenerated || m.origin == "ai" || m.origin == "template")) Text(
                    if (m.origin == "template") "Plantilla" else "Agente IA",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium
                )
                m.replyTo?.let { q ->
                    Surface(color = Color.Black.copy(alpha = 0.06f), shape = RoundedCornerShape(8.dp), modifier = Modifier.padding(bottom = 4.dp)) {
                        Text(
                            q.text ?: q.mediaKind?.let { Notifier.mediaLabel(it) } ?: "Mensaje",
                            fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(6.dp)
                        )
                    }
                }
                m.media?.let { MediaView(it) }
                val body = m.text?.takeIf { it.isNotBlank() } ?: m.media?.caption
                if (body != null) Text(body, fontSize = 15.sp)
                else if (m.media == null) Text("(${m.type})", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                    Text(clockTime(m.createdAt), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (mine) Text(
                        " " + when (m.status) {
                            "pending" -> "🕓"; "sent" -> "✓"; "delivered" -> "✓✓"; "read" -> "✓✓"; "failed" -> "⚠"; else -> ""
                        },
                        fontSize = 11.sp,
                        color = when (m.status) { "read" -> Acento; "failed" -> Rojo; else -> MaterialTheme.colorScheme.onSurfaceVariant }
                    )
                }
                if (m.status == "failed" && m.error != null) Text(m.error, fontSize = 12.sp, color = Rojo)
            }
        }
        DropdownMenu(menu, { menu = false }) {
            if (m.quotable) DropdownMenuItem(text = { Text("Responder citando") }, onClick = { menu = false; onReply(m) })
            m.text?.let { t ->
                DropdownMenuItem(text = { Text("Copiar texto") }, onClick = {
                    menu = false
                    (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager)
                        .setPrimaryClip(ClipData.newPlainText("mensaje", t))
                })
            }
            m.media?.takeIf { it.kind !in setOf("location", "contacts") }?.let { media ->
                DropdownMenuItem(text = { Text("Abrir adjunto") }, onClick = {
                    menu = false
                    scope.launch { openMedia(context, app.api, media) }
                })
            }
        }
    }
}

@Composable
private fun MediaView(media: MessageMedia) {
    val app = app()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var opening by remember { mutableStateOf(false) }
    when {
        media.fetchStatus == "pending" -> Text("Descargando adjunto…", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        media.fetchStatus == "failed" -> Text("No se pudo descargar el adjunto", fontSize = 13.sp, color = Rojo)
        media.kind == "image" || media.kind == "sticker" -> AsyncImage(
            model = app.api.mediaUrl(media.assetId), contentDescription = media.caption,
            contentScale = ContentScale.Crop,
            modifier = Modifier.padding(bottom = 4.dp).size(if (media.kind == "sticker") 120.dp else 240.dp)
                .clip(RoundedCornerShape(10.dp))
                .clickable { scope.launch { openMedia(context, app.api, media) } }
        )
        media.kind == "location" -> {
            val p = media.payload as? JsonObject
            val lat = p?.get("latitude")?.jsonPrimitive?.doubleOrNull
            val lng = p?.get("longitude")?.jsonPrimitive?.doubleOrNull
            val label = p?.get("name")?.jsonPrimitive?.content ?: p?.get("address")?.jsonPrimitive?.content ?: "Ubicación"
            Row(
                Modifier.clickable(enabled = lat != null && lng != null) {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:$lat,$lng?q=$lat,$lng")))
                }.padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Place, null, tint = Rojo)
                Text(label, modifier = Modifier.padding(start = 6.dp))
            }
        }
        else -> Row(
            Modifier.clickable {
                if (!opening) { opening = true; scope.launch { openMedia(context, app.api, media); opening = false } }
            }.padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (opening) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            else Icon(Icons.Default.Description, null, tint = MaterialTheme.colorScheme.primary)
            Text(
                media.fileName ?: Notifier.mediaLabel(media.kind),
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 6.dp)
            )
        }
    }
}

private suspend fun openMedia(context: Context, api: com.syrtel.crm.data.Api, media: MessageMedia) {
    try {
        val file = api.downloadMedia(media)
        val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, media.mimeType ?: "*/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(Intent.createChooser(intent, "Abrir con").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) {
        android.widget.Toast.makeText(context, e.message ?: "No se pudo abrir", android.widget.Toast.LENGTH_SHORT).show()
    }
}

@Composable
private fun Composer(
    draft: String, onDraft: (String) -> Unit, sending: Boolean,
    replyTo: Message?, onCancelReply: () -> Unit,
    canAttach: Boolean, onAttach: () -> Unit, onQuick: () -> Unit, onSend: () -> Unit,
) {
    Surface(tonalElevation = 2.dp) {
        Column(Modifier.navigationBarsPadding()) {
            if (replyTo != null) Row(
                Modifier.fillMaxWidth().padding(start = 14.dp, top = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Respondiendo: " + (replyTo.text ?: replyTo.media?.let { Notifier.mediaLabel(it.kind) } ?: ""),
                    fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                    color = MaterialTheme.colorScheme.primary
                )
                IconButton(onClick = onCancelReply) { Icon(Icons.Default.Close, "Cancelar") }
            }
            Row(Modifier.padding(6.dp), verticalAlignment = Alignment.Bottom) {
                IconButton(onClick = onQuick) { Icon(Icons.Default.Bolt, "Respuestas rápidas") }
                if (canAttach) IconButton(onClick = onAttach) { Icon(Icons.Default.AttachFile, "Adjuntar") }
                OutlinedTextField(
                    value = draft, onValueChange = onDraft,
                    placeholder = { Text("Escribe un mensaje") },
                    modifier = Modifier.weight(1f).heightIn(max = 140.dp),
                    shape = RoundedCornerShape(24.dp)
                )
                IconButton(onClick = onSend, enabled = draft.isNotBlank() && !sending) {
                    if (sending) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    else Icon(Icons.AutoMirrored.Filled.Send, "Enviar", tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun NotasTab(notas: List<Nota>, conversationId: String, onChanged: () -> Unit, onError: (String?) -> Unit) {
    val app = app()
    val scope = rememberCoroutineScope()
    var texto by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        Text(
            "Solo las ve tu equipo; el cliente no recibe nada.",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(14.dp, 10.dp)
        )
        LazyColumn(Modifier.weight(1f)) {
            items(notas.sortedByDescending { it.createdAt }, key = { it.id }) { n ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "${n.autor?.nombre ?: "Sistema"} · ${shortTime(n.createdAt)} ${clockTime(n.createdAt)}",
                            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(n.texto)
                    }
                    if (n.puedeBorrar) IconButton(onClick = {
                        scope.launch {
                            try { app.api.deleteNota(conversationId, n.id); onChanged() } catch (e: ApiException) { onError(e.message) }
                        }
                    }) { Icon(Icons.Default.Delete, "Borrar") }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
            }
        }
        Row(Modifier.padding(8.dp).navigationBarsPadding(), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(texto, { texto = it }, placeholder = { Text("Escribe una nota interna") }, modifier = Modifier.weight(1f))
            Button(
                enabled = texto.isNotBlank() && !busy, modifier = Modifier.padding(start = 8.dp),
                onClick = {
                    busy = true
                    scope.launch {
                        try { app.api.addNota(conversationId, texto.trim()); texto = ""; onChanged(); onError(null) }
                        catch (e: ApiException) { onError(e.message) }
                        finally { busy = false }
                    }
                }
            ) { Text("Guardar") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuickRepliesSheet(onDismiss: () -> Unit, onPick: (RespuestaRapida) -> Unit) {
    val app = app()
    var list by remember { mutableStateOf<List<RespuestaRapida>?>(null) }
    var q by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { list = runCatching { app.api.getRespuestas() }.getOrDefault(emptyList()) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 16.dp).heightIn(max = 520.dp)) {
            Text("Respuestas rápidas", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(q, { q = it }, placeholder = { Text("Buscar") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
            val l = list
            when {
                l == null -> Box(Modifier.fillMaxWidth().padding(24.dp), Alignment.Center) { CircularProgressIndicator() }
                l.isEmpty() -> Text("No hay respuestas rápidas. Se crean desde el CRM web.", modifier = Modifier.padding(vertical = 24.dp))
                else -> LazyColumn {
                    items(l.filter { q.isBlank() || fold(it.atajo + " " + it.texto).contains(fold(q)) }, key = { it.id }) { r ->
                        Column(Modifier.fillMaxWidth().clickable { onPick(r) }.padding(vertical = 10.dp)) {
                            Text("/${r.atajo}", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                            Text(r.texto, maxLines = 3, overflow = TextOverflow.Ellipsis, fontSize = 14.sp)
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                    }
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }
}

/** Elegir una plantilla aprobada y llenar sus variables {{1}}, {{2}}… */
@Composable
fun TemplateDialog(onDismiss: () -> Unit, onSend: (Template, List<String>) -> Unit) {
    val app = app()
    var list by remember { mutableStateOf<List<Template>?>(null) }
    var picked by remember { mutableStateOf<Template?>(null) }
    var vars by remember { mutableStateOf(listOf<String>()) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { list = runCatching { app.api.getTemplates() }.getOrDefault(emptyList()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(picked?.name ?: "Elige una plantilla") },
        text = {
            val t = picked
            if (t == null) {
                val l = list
                when {
                    l == null -> CircularProgressIndicator()
                    l.isEmpty() -> Text("No hay plantillas aprobadas por Meta. Créalas desde el CRM web.")
                    else -> LazyColumn(Modifier.heightIn(max = 380.dp)) {
                        items(l, key = { it.id }) { tp ->
                            Column(Modifier.fillMaxWidth().clickable {
                                picked = tp; vars = List(tp.variableCount) { "" }
                            }.padding(vertical = 8.dp)) {
                                Text(tp.name, fontWeight = FontWeight.SemiBold)
                                Text(tp.body, maxLines = 3, overflow = TextOverflow.Ellipsis, fontSize = 13.sp)
                            }
                            HorizontalDivider()
                        }
                    }
                }
            } else {
                Column {
                    Text(t.body, fontSize = 13.sp)
                    vars.forEachIndexed { i, v ->
                        OutlinedTextField(
                            v, { nv -> vars = vars.toMutableList().also { it[i] = nv } },
                            label = { Text("Variable {{${i + 1}}}") }, singleLine = true,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            }
        },
        confirmButton = {
            val t = picked
            if (t != null) TextButton(
                enabled = !busy && vars.all { it.isNotBlank() },
                onClick = { busy = true; onSend(t, vars) }
            ) { Text(if (busy) "Enviando…" else "Enviar") }
        },
        dismissButton = {
            if (picked != null) OutlinedButton(onClick = { picked = null }) { Text("Atrás") }
            else TextButton(onClick = onDismiss) { Text("Cancelar") }
        }
    )
}
