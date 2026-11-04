package com.syrtel.crm.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.syrtel.crm.data.ApiException
import com.syrtel.crm.data.BoardResponse
import com.syrtel.crm.data.Lead
import com.syrtel.crm.data.PatchLeadBody
import com.syrtel.crm.data.Stage
import kotlinx.coroutines.launch

/** El embudo de ventas, una etapa por pestaña: pensado para el pulgar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PipelineScreen(onOpenContact: (String) -> Unit) {
    val app = app()
    val scope = rememberCoroutineScope()
    var board by remember { mutableStateOf<BoardResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }
    var lossFor by remember { mutableStateOf<Pair<Lead, Stage>?>(null) }

    suspend fun load() {
        try { board = app.api.getBoard(); error = null } catch (e: ApiException) { error = e.message }
    }
    LaunchedEffect(Unit) { load() }

    fun move(lead: Lead, stage: Stage, reason: String? = null) = scope.launch {
        try { app.api.patchLead(lead.id, PatchLeadBody(stageId = stage.id, lossReason = reason)); load() }
        catch (e: ApiException) { error = e.message }
    }

    val b = board
    Column(Modifier.fillMaxSize()) {
        ErrorBar(error)
        if (b == null) { if (error == null) Loading(); return@Column }
        val stages = b.stages.sortedBy { it.position }
        if (stages.isEmpty()) { EmptyState("El embudo no tiene etapas", "Configúralas desde el CRM web."); return@Column }
        val sel = tab.coerceIn(0, stages.lastIndex)
        ScrollableTabRow(selectedTabIndex = sel, edgePadding = 8.dp) {
            stages.forEachIndexed { i, s ->
                val n = b.leads.count { it.stageId == s.id }
                Tab(sel == i, { tab = i }, text = { Text("${s.name} ($n)") })
            }
        }
        val stage = stages[sel]
        val leads = b.leads.filter { it.stageId == stage.id }.sortedBy { it.position }
        val total = leads.sumOf { it.amountCents ?: 0 }
        if (total > 0) Text(
            "Total en la etapa: ${money(total, b.currency)}",
            fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        )
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { scope.launch { refreshing = true; load(); refreshing = false } },
            modifier = Modifier.fillMaxSize()
        ) {
            if (leads.isEmpty()) EmptyState("Nadie en esta etapa")
            else LazyColumn(
                Modifier.fillMaxSize().padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(leads, key = { it.id }) { lead ->
                    LeadCard(
                        lead, b.currency, stages,
                        onOpen = { onOpenContact(lead.contact.id) },
                        onMove = { s -> if (s.kind == "lost") lossFor = lead to s else move(lead, s) }
                    )
                }
            }
        }
    }

    lossFor?.let { (lead, stage) ->
        AlertDialog(
            onDismissRequest = { lossFor = null },
            title = { Text("¿Por qué se perdió?") },
            text = {
                Column {
                    LOSS_REASONS.forEach { (code, label) ->
                        Text(label, modifier = Modifier.fillMaxWidth().clickable {
                            lossFor = null; move(lead, stage, code)
                        }.padding(vertical = 10.dp))
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { lossFor = null }) { Text("Cancelar") } }
        )
    }
}

@Composable
private fun LeadCard(lead: Lead, currency: String, stages: List<Stage>, onOpen: () -> Unit, onMove: (Stage) -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Row(Modifier.padding(start = 14.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(lead.contact.name.ifBlank { lead.contact.phone ?: "Sin nombre" }, fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                    money(lead.amountCents, lead.currency ?: currency)?.let { Chip(it, Verde) }
                    lead.priority?.let { Chip("Prioridad $it", priorityColor(it)) }
                    lead.lastActivityAt?.let { Chip("Actividad ${shortTime(it)}", MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, "Mover") }
                DropdownMenu(menu, { menu = false }) {
                    Text("Mover a…", fontSize = 12.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                    stages.filter { it.id != lead.stageId }.forEach { s ->
                        DropdownMenuItem(text = { Text(s.name) }, onClick = { menu = false; onMove(s) })
                    }
                }
            }
        }
    }
}
