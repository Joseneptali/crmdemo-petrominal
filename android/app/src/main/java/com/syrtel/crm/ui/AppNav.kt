package com.syrtel.crm.ui

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.ViewKanban
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.outlined.BatteryAlert
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.ViewKanban
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.syrtel.crm.MainActivity
import com.syrtel.crm.data.LinkState
import com.syrtel.crm.notify.EnTurnoService
import com.syrtel.crm.notify.RevisionWorker
import kotlinx.coroutines.launch

@Composable
fun AppNav(activity: MainActivity) {
    // La animación del logo se ve una vez por arranque de la app.
    var splash by rememberSaveable { mutableStateOf(true) }
    AnimatedContent(
        targetState = splash,
        transitionSpec = { fadeIn(tween(350)) togetherWith fadeOut(tween(350)) },
        label = "splash"
    ) { showSplash ->
        if (showSplash) AnimatedSplash(onDone = { splash = false }) else MainNav(activity)
    }
}

@Composable
private fun MainNav(activity: MainActivity) {
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
            app.live.nudge()
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

private data class TabItem(val title: String, val selected: ImageVector, val idle: ImageVector)

private val TABS = listOf(
    TabItem("Bandeja", Icons.AutoMirrored.Filled.Chat, Icons.AutoMirrored.Outlined.Chat),
    TabItem("Contactos", Icons.Filled.People, Icons.Outlined.People),
    TabItem("Embudo", Icons.Filled.ViewKanban, Icons.Outlined.ViewKanban),
    TabItem("Citas", Icons.Filled.CalendarMonth, Icons.Outlined.CalendarMonth),
)

@Composable
private fun HomeScreen(nav: NavHostController) {
    val app = app()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var enTurno by remember { mutableStateOf(app.prefs.enTurno) }
    var menu by remember { mutableStateOf(false) }
    var confirmLogout by remember { mutableStateOf(false) }
    var askBattery by remember { mutableStateOf(false) }
    var unread by remember { mutableIntStateOf(0) }
    val link by app.live.state.collectAsState()

    // Para que Android no corte los avisos: pedir una vez quitar la
    // optimización de batería (solo si sigue activa).
    LaunchedEffect(enTurno) {
        if (enTurno && !app.prefs.askedBattery && !ignoringBattery(context)) askBattery = true
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Surface(color = Tinta) {
                Column(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LogoMark(34.dp)
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(TABS[tab].title, color = Crema, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                            LinkPill(link, enTurno)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Switch(
                                checked = enTurno,
                                onCheckedChange = {
                                    enTurno = it
                                    app.prefs.enTurno = it
                                    if (it) EnTurnoService.start(context) else EnTurnoService.stop(context)
                                },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = Crema, checkedTrackColor = Naranja,
                                    uncheckedThumbColor = Color(0xFF9DAAA4), uncheckedTrackColor = Tinta3,
                                    uncheckedBorderColor = Color(0xFF3A4B44)
                                )
                            )
                            Text(if (enTurno) "En turno" else "Fuera de turno", color = Color(0xFFC9D3CF), fontSize = 10.sp)
                        }
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "Más opciones", tint = Crema) }
                            DropdownMenu(menu, { menu = false }) {
                                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                                    Text(app.prefs.userName.ifBlank { app.prefs.email }, fontWeight = FontWeight.SemiBold)
                                    Text(app.prefs.server.removePrefix("https://"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                HorizontalDivider()
                                if (!ignoringBattery(context)) DropdownMenuItem(
                                    text = { Text("Avisos sin cortes (batería)") },
                                    leadingIcon = { Icon(Icons.Outlined.BatteryAlert, null) },
                                    onClick = { menu = false; requestBatteryExemption(context) }
                                )
                                DropdownMenuItem(
                                    text = { Text("Cerrar sesión") },
                                    leadingIcon = { Icon(Icons.AutoMirrored.Outlined.Logout, null) },
                                    onClick = { menu = false; confirmLogout = true }
                                )
                            }
                        }
                    }
                }
            }
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                TABS.forEachIndexed { i, t ->
                    NavigationBarItem(
                        selected = tab == i, onClick = { tab = i },
                        label = { Text(t.title, fontWeight = if (tab == i) FontWeight.Bold else FontWeight.Medium) },
                        icon = {
                            BadgedBox(badge = {
                                if (i == 0 && unread > 0) Badge(containerColor = Naranja, contentColor = Color.White) {
                                    Text(if (unread > 99) "99+" else "$unread")
                                }
                            }) { Icon(if (tab == i) t.selected else t.idle, null) }
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedTextColor = MaterialTheme.colorScheme.onBackground,
                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    )
                }
            }
        }
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
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

    if (askBattery) AlertDialog(
        onDismissRequest = { askBattery = false; app.prefs.askedBattery = true },
        icon = { Icon(Icons.Outlined.BatteryAlert, null) },
        title = { Text("Avisos sin cortes") },
        text = { Text("Para que los mensajes de tus clientes te lleguen al instante aunque no estés en la app, permite que Syrtel CRM funcione sin restricción de batería.") },
        confirmButton = {
            TextButton(onClick = {
                askBattery = false; app.prefs.askedBattery = true
                requestBatteryExemption(context)
            }) { Text("Permitir") }
        },
        dismissButton = { TextButton(onClick = { askBattery = false; app.prefs.askedBattery = true }) { Text("Ahora no") } }
    )

    if (confirmLogout) AlertDialog(
        onDismissRequest = { confirmLogout = false },
        title = { Text("¿Cerrar sesión?") },
        text = { Text("Dejarás de recibir avisos de clientes en este teléfono.") },
        confirmButton = {
            TextButton(onClick = {
                confirmLogout = false
                scope.launch {
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

/** «● En vivo», «● Sincronizando», «● Sin conexión», con un latido suave. */
@Composable
private fun LinkPill(link: LinkState, enTurno: Boolean) {
    val (label, color) = when (link) {
        LinkState.LIVE -> "En vivo" to Color(0xFF6FD3A0)
        LinkState.SYNCING -> "Conectado" to Color(0xFF6FD3A0)
        LinkState.OFFLINE -> "Conectando…" to Color(0xFFF2C46B)
    }
    val pulse by rememberInfiniteTransition(label = "pulse").animateFloat(
        0.35f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "a"
    )
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
        Box(Modifier.size(7.dp).alpha(if (link == LinkState.OFFLINE) pulse else 1f).background(color, CircleShape))
        Text(
            label + if (!enTurno) " · avisos limitados" else "",
            color = Color(0xFFC9D3CF), fontSize = 12.sp, modifier = Modifier.padding(start = 6.dp)
        )
    }
}

private fun ignoringBattery(context: Context): Boolean =
    context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)

@SuppressLint("BatteryLife")
private fun requestBatteryExemption(context: Context) {
    runCatching {
        context.startActivity(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }.onFailure {
        context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
