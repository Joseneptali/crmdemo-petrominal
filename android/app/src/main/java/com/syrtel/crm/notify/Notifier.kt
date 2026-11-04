package com.syrtel.crm.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.syrtel.crm.MainActivity
import com.syrtel.crm.R
import com.syrtel.crm.data.Api
import com.syrtel.crm.data.Conversation
import com.syrtel.crm.data.Live
import com.syrtel.crm.data.MessageNewEvent
import com.syrtel.crm.data.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Convierte los cambios del CRM en avisos del teléfono: un mensaje nuevo de
 * un cliente o una conversación que el agente le pasó a una persona.
 *
 * Escucha las dos vías de [Live] (SSE y sincronización) y recuerda, por
 * conversación, el último mensaje entrante ya avisado: así el mismo mensaje
 * nunca suena dos veces. Nunca avisa de la conversación que el asesor tiene
 * abierta en pantalla.
 */
class Notifier(private val context: Context, private val api: Api, live: Live) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val names = ConcurrentHashMap<String, String>()
    private val handoffs = ConcurrentHashMap<String, Boolean>()
    /** Último entrante conocido por conversación (ya avisado o de antes de abrir). */
    private val seenInbound = ConcurrentHashMap<String, Instant>()
    @Volatile private var baselineReady = false

    /** La conversación abierta en pantalla (la fija ChatScreen). */
    @Volatile var openConversationId: String? = null

    init {
        createChannels()
        scope.launch {
            live.events.collect { ev ->
                runCatching {
                    when (ev.type) {
                        "sync.initial" -> baseline(ev.changed)
                        "sync" -> onSync(ev.changed)
                        "message.new" -> onMessage(json.decodeFromString<MessageNewEvent>(ev.data))
                    }
                }
            }
        }
    }

    /** Primera foto de la bandeja: se toma como punto de partida, sin avisar. */
    private fun baseline(list: List<Conversation>) {
        for (c in list) {
            remember(c)
            parse(c.lastInboundAt)?.let { seenInbound.merge(c.id, it) { a, b -> if (a.isAfter(b)) a else b } }
        }
        baselineReady = true
    }

    private fun onSync(changed: List<Conversation>) {
        if (!baselineReady) { baseline(changed); return }
        for (c in changed) {
            val wasHandoff = handoffs[c.id]
            remember(c)
            val inbound = parse(c.lastInboundAt)
            val prev = seenInbound[c.id]
            if (inbound != null && (prev == null || inbound.isAfter(prev.plusMillis(1500)))) {
                seenInbound[c.id] = inbound
                if (c.unreadCount > 0 && !isOpen(c.id)) {
                    notifyConversation(
                        c.id, displayName(c),
                        c.preview?.takeIf { it.isNotBlank() } ?: "Mensaje nuevo",
                        if (c.needsHuman) CHANNEL_HANDOFF else CHANNEL_MESSAGES,
                        c.unreadCount
                    )
                    continue
                }
            }
            if (c.needsHuman && wasHandoff == false && !isOpen(c.id)) {
                notifyConversation(
                    c.id, displayName(c),
                    "Requiere atención de una persona" + (c.handoffReason?.let { ": $it" } ?: ""),
                    CHANNEL_HANDOFF, c.unreadCount
                )
            }
        }
    }

    private suspend fun onMessage(ev: MessageNewEvent) {
        if (!ev.message.incoming || isOpen(ev.conversationId)) return
        val at = parse(ev.message.createdAt) ?: Instant.now()
        val prev = seenInbound[ev.conversationId]
        if (prev != null && !at.isAfter(prev.plusMillis(1500))) return
        seenInbound[ev.conversationId] = at
        val name = names[ev.conversationId] ?: run {
            runCatching { api.getConversations().forEach { remember(it) } }
            names[ev.conversationId] ?: "Cliente"
        }
        val text = ev.message.text?.takeIf { it.isNotBlank() }
            ?: ev.message.media?.let { mediaLabel(it.kind) } ?: "Mensaje nuevo"
        notifyConversation(ev.conversationId, name, text, CHANNEL_MESSAGES, 0)
    }

    private fun isOpen(id: String) = id == openConversationId && AppState.foreground

    private fun remember(c: Conversation) {
        names[c.id] = displayName(c)
        handoffs[c.id] = c.needsHuman
    }

    /** Lo llama la bandeja al cargar. */
    fun remember(conversations: List<Conversation>) = conversations.forEach { remember(it) }

    private fun displayName(c: Conversation) =
        c.contact.name.ifBlank { c.contact.phone?.let { "+$it" } ?: "Cliente" }

    private fun parse(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

    fun notifyConversation(conversationId: String, title: String, text: String, channel: String, unread: Int) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(MainActivity.EXTRA_CONVERSATION, conversationId)
        val pi = PendingIntent.getActivity(
            context, conversationId.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_chat)
            .setColor(0xFFE25B16.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setNumber(unread)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        NotificationManagerCompat.from(context).notify(conversationId.hashCode(), n)
    }

    fun cancel(conversationId: String) =
        NotificationManagerCompat.from(context).cancel(conversationId.hashCode())

    private fun createChannels() {
        val nm = context.getSystemService(NotificationManager::class.java)
        val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        fun loud(id: String, name: String) = NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
            enableVibration(true)
            enableLights(true)
            lightColor = 0xFFE25B16.toInt()
            setSound(sound, attrs)
        }
        nm.createNotificationChannel(loud(CHANNEL_MESSAGES, "Mensajes de clientes"))
        nm.createNotificationChannel(loud(CHANNEL_HANDOFF, "Requieren atención"))
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SERVICE, "En turno (conexión activa)", NotificationManager.IMPORTANCE_MIN)
                .apply { setShowBadge(false) }
        )
    }

    companion object {
        // Canales nuevos: los de la versión anterior quedaron sin sonido propio.
        const val CHANNEL_MESSAGES = "mensajes_v2"
        const val CHANNEL_HANDOFF = "atencion_v2"
        const val CHANNEL_SERVICE = "en_turno"

        fun mediaLabel(kind: String) = when (kind) {
            "image" -> "📷 Imagen"
            "video" -> "🎬 Video"
            "audio" -> "🎤 Audio"
            "document" -> "📄 Documento"
            "sticker" -> "Sticker"
            "location" -> "📍 Ubicación"
            "contacts" -> "👤 Contacto"
            else -> "Adjunto"
        }
    }
}

/** Si la app está en pantalla (lo actualiza App con ProcessLifecycleOwner). */
object AppState {
    @Volatile var foreground: Boolean = false
}
