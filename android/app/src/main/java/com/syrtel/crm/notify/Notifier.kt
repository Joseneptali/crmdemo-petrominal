package com.syrtel.crm.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.syrtel.crm.MainActivity
import com.syrtel.crm.R
import com.syrtel.crm.data.Api
import com.syrtel.crm.data.ConversationUpdatedEvent
import com.syrtel.crm.data.Live
import com.syrtel.crm.data.MessageNewEvent
import com.syrtel.crm.data.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.ConcurrentHashMap

/**
 * Convierte los eventos del CRM en avisos del teléfono: un mensaje nuevo de
 * un cliente o una conversación que el agente le pasó a una persona. Nunca
 * avisa de la conversación que el asesor ya tiene abierta en pantalla.
 */
class Notifier(private val context: Context, private val api: Api, live: Live) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val names = ConcurrentHashMap<String, String>()
    private val handoffs = ConcurrentHashMap<String, Boolean>()

    /** La conversación abierta en pantalla (la fija ChatScreen). */
    @Volatile var openConversationId: String? = null

    init {
        createChannels()
        scope.launch {
            live.events.collect { ev ->
                runCatching {
                    when (ev.type) {
                        "message.new" -> onMessage(json.decodeFromString<MessageNewEvent>(ev.data))
                        "conversation.updated" -> onConversation(json.decodeFromString<ConversationUpdatedEvent>(ev.data))
                    }
                }
            }
        }
    }

    private suspend fun onMessage(ev: MessageNewEvent) {
        if (!ev.message.incoming) return
        if (ev.conversationId == openConversationId && AppState.foreground) return
        val name = nameOf(ev.conversationId)
        val text = ev.message.text?.takeIf { it.isNotBlank() }
            ?: ev.message.media?.let { mediaLabel(it.kind) } ?: "Mensaje nuevo"
        notifyConversation(ev.conversationId, name, text, CHANNEL_MESSAGES)
    }

    private fun onConversation(ev: ConversationUpdatedEvent) {
        val c = ev.conversation
        val id = c["id"]?.jsonPrimitive?.content ?: return
        val contactName = runCatching {
            (c["contact"] as? kotlinx.serialization.json.JsonObject)?.get("name")?.jsonPrimitive?.content
        }.getOrNull()
        if (!contactName.isNullOrBlank()) names[id] = contactName
        if (!c.containsKey("handoffAt")) return
        val needsHuman = c["handoffAt"]?.let { it !is kotlinx.serialization.json.JsonNull } == true
        val before = handoffs.put(id, needsHuman)
        if (needsHuman && before != true && id != openConversationId) {
            val reason = c["handoffReason"]?.takeIf { it !is kotlinx.serialization.json.JsonNull }
                ?.jsonPrimitive?.content
            notifyConversation(
                id, names[id] ?: "Cliente",
                "Requiere atención de una persona" + (reason?.let { ": $it" } ?: ""),
                CHANNEL_HANDOFF
            )
        }
    }

    /** Lo llama la bandeja al cargar, para tener nombres y estado de traspaso. */
    fun remember(conversations: List<com.syrtel.crm.data.Conversation>) {
        for (c in conversations) {
            names[c.id] = c.contact.name.ifBlank { c.contact.phone ?: "Cliente" }
            handoffs[c.id] = c.needsHuman
        }
    }

    private suspend fun nameOf(conversationId: String): String {
        names[conversationId]?.let { return it }
        runCatching { remember(api.getConversations()) }
        return names[conversationId] ?: "Cliente"
    }

    fun notifyConversation(conversationId: String, title: String, text: String, channel: String) {
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
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setGroup("conversaciones")
            .build()
        NotificationManagerCompat.from(context).notify(conversationId.hashCode(), n)
    }

    fun cancel(conversationId: String) =
        NotificationManagerCompat.from(context).cancel(conversationId.hashCode())

    private fun createChannels() {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_MESSAGES, "Mensajes de clientes", NotificationManager.IMPORTANCE_HIGH)
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_HANDOFF, "Requieren atención", NotificationManager.IMPORTANCE_HIGH)
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SERVICE, "En turno (conexión activa)", NotificationManager.IMPORTANCE_MIN)
                .apply { setShowBadge(false) }
        )
    }

    companion object {
        const val CHANNEL_MESSAGES = "mensajes"
        const val CHANNEL_HANDOFF = "atencion"
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
