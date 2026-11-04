package com.syrtel.crm.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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

    suspend fun load() {
        try {
            val list = app.api.getConversations()
                .sortedByDescending { it.lastMessageAt ?: "" }
            items = list
            app.notifier.remember(list)
            onUnread(list.sumOf { it.unreadCount })
            error = null
        } catch (e: ApiException) {
            error = e.message
        }
    }

    LaunchedEffect(Unit) { load() }
    // Tiempo real: cualquier cambio en la bandeja refresca la lista.
    LaunchedEffect(Unit) {
        app.live.events
            .filter { it.type in setOf("message.new", "message.status", "conversation.updated", "conversation.deleted", "reconnected") }
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
        ErrorBar(error)
        OutlinedTextField(
            value = query, onValueChange = { query = it },
            placeholder = { Text("Buscar cliente o mensaje") },
            leadingIcon = { Icon(Icons.Default.Search, null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
        )
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
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
                    label = { Text(if (count > 0) "${f.label} · $count" else f.label) }
                )
            }
        }
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { scope.launch { refreshing = true; load(); refreshing = false } },
            modifier = Modifier.fillMaxSize()
        ) {
            when {
                items == null && error == null -> Loading()
                visible.isEmpty() -> EmptyState(
                    if (items.isNullOrEmpty()) "Aún no hay conversaciones" else "Nada con este filtro",
                    if (items.isNullOrEmpty()) "Cuando un cliente escriba, aparecerá aquí." else null
                )
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(visible, key = { it.id }) { c ->
                        ConversationRow(c) { onOpen(c.id) }
                        HorizontalDivider(Modifier.padding(start = 72.dp), color = MaterialTheme.colorScheme.surfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun ConversationRow(c: Conversation, onClick: () -> Unit) {
    val name = c.contact.name.ifBlank { c.contact.phone?.let { "+$it" } ?: "Cliente" }
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Avatar(name)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    name, fontWeight = if (c.unreadCount > 0) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)
                )
                Text(
                    shortTime(c.lastMessageAt), fontSize = 12.sp,
                    color = if (c.unreadCount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    c.preview ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f)
                )
                if (c.unreadCount > 0) Badge(containerColor = MaterialTheme.colorScheme.primary) {
                    Text("${c.unreadCount}", modifier = Modifier.padding(horizontal = 2.dp))
                }
            }
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (c.channel != "whatsapp") Chip(channelLabel(c.channel), channelColor(c.channel))
                when {
                    c.needsHuman -> Chip("Requiere atención", Rojo)
                    c.aiEnabled -> Chip("Agente IA", Acento)
                    else -> Chip("Atiende persona", Ambar)
                }
                if (!c.canReply) Chip("Ventana cerrada", MaterialTheme.colorScheme.onSurfaceVariant)
                c.stageName?.let { Chip(it, Verde) }
            }
        }
    }
}

/** Minúsculas y sin acentos, como la búsqueda del CRM. */
fun fold(s: String): String =
    Normalizer.normalize(s.lowercase().trim(), Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")
