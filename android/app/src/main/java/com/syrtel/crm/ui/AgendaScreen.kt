package com.syrtel.crm.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import com.syrtel.crm.data.Booking
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

/** Próximas citas (30 días). Si la agenda no está activa en el CRM, lo dice. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgendaScreen(onOpenChat: (String) -> Unit, onOpenContact: (String) -> Unit) {
    val app = app()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var bookings by remember { mutableStateOf<List<Booking>?>(null) }
    var disabled by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }

    suspend fun load() {
        try {
            val r = app.api.getBookings()
            disabled = r == null
            bookings = r.orEmpty()
                .filter { it.kind == "session" && !it.isTest && it.status != "cancelada" }
                .sortedBy { it.scheduledAtUtc }
            error = null
        } catch (e: ApiException) { error = e.message }
    }
    LaunchedEffect(Unit) { load() }
    LaunchedEffect(Unit) { app.live.events.filter { it.type == "booking.updated" }.collect { load() } }

    Column(Modifier.fillMaxSize()) {
        ErrorBar(error)
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { scope.launch { refreshing = true; load(); refreshing = false } },
            modifier = Modifier.fillMaxSize()
        ) {
            val l = bookings
            when {
                disabled -> EmptyState("La agenda no está activada", "Actívala en el CRM (bandera AGENDA) para ver las citas aquí.")
                l == null -> if (error == null) Loading()
                l.isEmpty() -> EmptyState("Sin citas en los próximos 30 días")
                else -> LazyColumn(
                    Modifier.fillMaxSize().padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(l, key = { it.id }) { b ->
                        Card(Modifier.fillMaxWidth().clickable(enabled = b.contact != null) { b.contact?.let { onOpenContact(it.id) } }) {
                            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.width(76.dp)) {
                                    Text(b.time, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                    Text(
                                        b.weekday.ifBlank { b.date }, fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(b.date.takeLast(5).replace('-', '/'), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Column(Modifier.weight(1f)) {
                                    Text(b.contact?.name?.ifBlank { null } ?: "Sin cliente", fontWeight = FontWeight.SemiBold)
                                    Text("${b.durationMinutes} min" + if (b.status != "agendada") " · ${b.status.replace('_', ' ')}" else "", fontSize = 13.sp)
                                    b.notes?.let { Text(it, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2) }
                                    Row {
                                        b.conversationId?.let { id -> TextButton(onClick = { onOpenChat(id) }) { Text("Chat") } }
                                        b.meetingLink?.let { link ->
                                            TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link))) }) { Text("Reunión") }
                                        }
                                    }
                                }
                                if (b.status == "agendada") Chip("Agendada", Acento)
                            }
                        }
                    }
                }
            }
        }
    }
}
