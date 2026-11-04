package com.syrtel.crm.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.ViewKanban
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.syrtel.crm.MainActivity
import com.syrtel.crm.notify.EnTurnoService
import com.syrtel.crm.notify.RevisionWorker
import kotlinx.coroutines.launch

@Composable
fun AppNav(activity: MainActivity) {
    val app = app()
    val nav = rememberNavController()
    val loggedIn by app.loggedIn.collectAsState()
    val pending by activity.pendingConversation.collectAsState()

    // Al caducar la sesión (401) se vuelve al login desde cualquier pantalla.
    LaunchedEffect(loggedIn) {
        if (!loggedIn) {
            EnTurnoService.stop(app)
            nav.navigate("login") { popUpTo(0) }
        } else {
            RevisionWorker.schedule(app)
            if (app.prefs.enTurno) EnTurnoService.start(app)
        }
    }
    // Tocar una notificación abre esa conversación.
    LaunchedEffect(pending, loggedIn) {
        val id = pending ?: return@LaunchedEffect
        if (loggedIn) {
            nav.navigate("chat/$id") { launchSingleTop = true }
            activity.pendingConversation.value = null
        }
    }

    val start = remember { if (loggedIn) "home" else "login" }
    NavHost(nav, startDestination = start) {
        composable("login") {
            LoginScreen(onDone = {
                app.loggedIn.value = true
                nav.navigate("home") { popUpTo(0) }
            })
        }
        composable("home") { HomeScreen(nav) }
        composable("chat/{id}") { entry ->
            ChatScreen(
                conversationId = entry.arguments?.getString("id").orEmpty(),
                onBack = { nav.popBackStack() },
                onOpenContact = { nav.navigate("contact/$it") }
            )
        }
        composable("contact/{id}") { entry ->
            ContactScreen(
                contactId = entry.arguments?.getString("id").orEmpty(),
                onBack = { nav.popBackStack() },
                onOpenChat = { nav.navigate("chat/$it") { launchSingleTop = true } }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeScreen(nav: NavHostController) {
    val app = app()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var enTurno by remember { mutableStateOf(app.prefs.enTurno) }
    var menu by remember { mutableStateOf(false) }
    var confirmLogout by remember { mutableStateOf(false) }
    var unread by remember { mutableIntStateOf(0) }
    val connected by app.live.connected.collectAsState()

    val titles = listOf("Bandeja", "Contactos", "Embudo", "Citas")

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Box {
                        Text(titles[tab])
                    }
                },
                actions = {
                    Text(
                        if (enTurno) "En turno" else "Fuera",
                        fontSize = 12.sp,
                        color = if (enTurno && connected) Verde else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Switch(
                        checked = enTurno,
                        onCheckedChange = {
                            enTurno = it
                            app.prefs.enTurno = it
                            if (it) EnTurnoService.start(context) else EnTurnoService.stop(context)
                        },
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                    IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, "Más") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(
                            text = {
                                Text(
                                    "${app.prefs.userName.ifBlank { app.prefs.email }}\n${app.prefs.server.removePrefix("https://")}",
                                    fontSize = 12.sp
                                )
                            },
                            onClick = {}, enabled = false
                        )
                        DropdownMenuItem(
                            text = { Text("Cerrar sesión") },
                            leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, null) },
                            onClick = { menu = false; confirmLogout = true }
                        )
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == 0, onClick = { tab = 0 }, label = { Text("Bandeja") },
                    icon = {
                        BadgedBox(badge = { if (unread > 0) Badge { Text(if (unread > 99) "99+" else "$unread") } }) {
                            Icon(Icons.Default.Chat, null)
                        }
                    }
                )
                NavigationBarItem(tab == 1, { tab = 1 }, { Icon(Icons.Default.People, null) }, label = { Text("Contactos") })
                NavigationBarItem(tab == 2, { tab = 2 }, { Icon(Icons.Default.ViewKanban, null) }, label = { Text("Embudo") })
                NavigationBarItem(tab == 3, { tab = 3 }, { Icon(Icons.Default.CalendarMonth, null) }, label = { Text("Citas") })
            }
        }
    ) { pad ->
        Box(Modifier.padding(pad), contentAlignment = Alignment.TopCenter) {
            when (tab) {
                0 -> InboxScreen(onOpen = { nav.navigate("chat/$it") }, onUnread = { unread = it })
                1 -> ContactsScreen(onOpen = { nav.navigate("contact/$it") })
                2 -> PipelineScreen(onOpenContact = { nav.navigate("contact/$it") })
                3 -> AgendaScreen(
                    onOpenChat = { nav.navigate("chat/$it") },
                    onOpenContact = { nav.navigate("contact/$it") }
                )
            }
        }
    }

    if (confirmLogout) AlertDialog(
        onDismissRequest = { confirmLogout = false },
        title = { Text("¿Cerrar sesión?") },
        text = { Text("Dejarás de recibir avisos de clientes en este teléfono.") },
        confirmButton = {
            TextButton(onClick = {
                confirmLogout = false
                scope.launch {
                    app.prefs.enTurno = false
                    EnTurnoService.stop(context)
                    RevisionWorker.cancel(context)
                    app.api.signOut()
                    app.loggedIn.value = false
                }
            }) { Text("Cerrar sesión") }
        },
        dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Cancelar") } }
    )
}
