package com.syrtel.crm.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.syrtel.crm.data.ApiException
import com.syrtel.crm.data.Conversation
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import java.text.Normalizer

private enum class Filtro(val label: String) { TODAS("Todas"), SIN_LEER("Sin leer"), ATENCION("Requieren atención"), ABIERTAS("Ventana abierta") }

@OptIn(ExperimentalMaterial3Api::class, FlowPreview::class)
@Composable
fun InboxScreen(onOpen: (String) -> Unit, onUnread: (Int) -> Unit) {
    val app = app()
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<Conversation>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var filtro by rememberSaveable { mutableStateOf(Filtro.TODAS) }

    fun publish(list: List<Conversation>) {
        val sorted = list.sortedByDescending { it.lastMessageAt ?: "" }
        items = sorted
        onUnread(sorted.sumOf { it.unreadCount })
    }

    suspend fun load() {
        try {
            val list = app.api.getConversations()
            app.notifier.remember(list)
            publish(list)
            error = null
        } catch (e: ApiException) {
            error = e.message
        }
    }

    LaunchedEffect(Unit) { load() }
    // Tiempo real (vía sincronización): se mezclan solo las conversaciones que cambiaron.
    LaunchedEffect(Unit) {
        app.live.events.filter { it.type == "sync" || it.type == "sync.initial" }.collect { ev ->
            val cur = items ?: return@collect
            val byId = cur.associateBy { it.id }.toMutableMap()
            ev.changed.forEach { byId[it.id] = it }
            publish(byId.values.toList())
            error = null
        }
    }
    // Vía SSE: eliminaciones y reconexiones piden la lista completa.
    LaunchedEffect(Unit) {
        app.live.events
            .filter { it.type == "conversation.deleted" || it.type == "reconnected" }
            .debounce(400)
            .collect { load() }
    }

    val visible = remember(items, query, filtro) {
        val q = fold(query)
        items.orEmpty().filter { c ->
            val pasaFiltro = when (filtro) {
                Filtro.TODAS -> true
                Filtro.SIN_LEER -> c.unreadCount > 0
                Filtro.ATENCION -> c.needsHuman || !c.aiEnabled
                Filtro.ABIERTAS -> c.canReply
            }
            pasaFiltro && (q.isEmpty() ||
                fold(c.contact.name).contains(q) ||
                (c.contact.phone ?: "").contains(q.filter { it.isDigit() }.ifEmpty { "\u0000" }) ||
                fold(c.preview ?: "").contains(q))
        }
    }

    Column(Modifier.fillMaxSize()) {
        SearchField(query, { query = it }, "Buscar cliente o mensaje")
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Filtro.entries.forEach { f ->
                val count = when (f) {
                    Filtro.SIN_LEER -> items.orEmpty().count { it.unreadCount > 0 }
                    Filtro.ATENCION -> items.orEmpty().count { it.needsHuman || !it.aiEnabled }
                    else -> 0
                }
                FilterChip(
                    selected = filtro == f, onClick = { filtro = f },
                    label = { Text(if (count > 0) "${f.label} · $count" else f.label, fontWeight = FontWeight.SemiBold) },
                    shape = RoundedCornerShape(50),
                    border = null,
                    colors = FilterChipDefaults.filterChipColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                        labelColor = MaterialTheme.colorScheme.onSurface,
                        selectedContainerColor = MaterialTheme.colorScheme.secondary,
                        selectedLabelColor = MaterialTheme.colorScheme.onSecondary,
                    )
                )
            }
        }
        ErrorBar(error)
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { scope.launch { refreshing = true; load(); refreshing = false } },
            modifier = Modifier.fillMaxSize()
        ) {
            when {
                items == null && error == null -> Loading()
                visible.isEmpty() -> EmptyState(
                    if (items.isNullOrEmpty()) "Aún no hay conversaciones" else "Nada con este filtro",
                    if (items.isNullOrEmpty()) "Cuando un cliente escriba, aparecerá aquí al instante." else null
                )
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 6.dp)) {
                    items(visible, key = { it.id }) { c ->
                        ConversationRow(c, Modifier.animateItem()) { onOpen(c.id) }
                    }
                }
            }
        }
    }
}

/** Buscador redondeado, relleno, sin borde. */
@Composable
fun SearchField(value: String, onChange: (String) -> Unit, placeholder: String) {
    TextField(
        value = value, onValueChange = onChange,
        placeholder = { Text(placeholder) },
        leadingIcon = { Icon(Icons.Outlined.Search, null) },
        trailingIcon = {
            if (value.isNotEmpty()) IconButton(onClick = { onChange("") }) { Icon(Icons.Outlined.Close, "Borrar búsqueda") }
        },
        singleLine = true,
        shape = RoundedCornerShape(50),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            focusedPlaceholderColor = MaterialTheme.colorScheme.onSurfaceVariant,
            unfocusedPlaceholderColor = MaterialTheme.colorScheme.onSurfaceVariant,
            focusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
            unfocusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp).defaultMinSize(minHeight = 50.dp)
    )
}

@Composable
private fun ConversationRow(c: Conversation, modifier: Modifier, onClick: () -> Unit) {
    val name = c.contact.name.ifBlank { c.contact.phone?.let { "+$it" } ?: "Cliente" }
    val unread = c.unreadCount > 0
    // Una conversación con mensajes nuevos se resalta con un fondo suave.
    val bg by animateColorAsState(
        if (unread) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.background, label = "bg"
    )
    Surface(
        color = bg, shape = RoundedCornerShape(20.dp),
        modifier = modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 3.dp)
    ) {
        Row(
            Modifier.clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box {
                Avatar(name, 50.dp)
                if (c.needsHuman) Box(
                    Modifier.align(Alignment.BottomEnd).size(14.dp)
                        .background(MaterialTheme.colorScheme.background, CircleShape).padding(2.dp)
                        .background(Naranja, CircleShape)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        name, fontWeight = if (unread) FontWeight.Bold else FontWeight.SemiBold, fontSize = 16.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)
                    )
                    Text(
                        shortTime(c.lastMessageAt), fontSize = 12.sp,
                        fontWeight = if (unread) FontWeight.Bold else FontWeight.Normal,
                        color = if (unread) Acento else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                    Text(
                        c.preview ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 14.sp,
                        color = if (unread) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (unread) FontWeight.Medium else FontWeight.Normal,
                        modifier = Modifier.weight(1f)
                    )
                    if (unread) Box(
                        Modifier.padding(start = 8.dp).defaultMinSize(minWidth = 22.dp).height(22.dp)
                            .background(NaranjaBoton, RoundedCornerShape(50)).padding(horizontal = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            if (c.unreadCount > 99) "99+" else "${c.unreadCount}",
                            color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold
                        )
                    }
                }
                Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (c.channel != "whatsapp") Chip(channelLabel(c.channel), channelColor(c.channel))
                    when {
                        c.needsHuman -> Chip("Requiere atención", Rojo)
                        c.aiEnabled -> Chip("Agente IA", Acento)
                        else -> Chip("Atiende persona", Ambar)
                    }
                    if (!c.canReply) Chip("Ventana cerrada", Neutro)
                    c.stageName?.let { Chip(it, Verde) }
                }
            }
        }
    }
}

/** Minúsculas y sin acentos, como la búsqueda del CRM. */
fun fold(s: String): String =
    Normalizer.normalize(s.lowercase().trim(), Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")
