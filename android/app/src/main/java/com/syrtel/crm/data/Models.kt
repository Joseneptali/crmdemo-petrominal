package com.syrtel.crm.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/*
 * Espejo de los DTOs de Vocero CRM (src/lib/types.ts y las rutas /api/...).
 * Todo campo que el servidor pueda omitir o añadir en el futuro tiene valor
 * por defecto: el JSON se lee con ignoreUnknownKeys.
 */

@Serializable
data class ApiErrorBody(val error: ApiErrorDetail? = null)

@Serializable
data class ApiErrorDetail(val code: String = "", val message: String = "")

/* ---------- Sesión ---------- */

@Serializable
data class SessionResponse(val user: SessionUser? = null)

@Serializable
data class SessionUser(val id: String = "", val name: String = "", val email: String = "")

/* ---------- Bandeja ---------- */

@Serializable
data class ConversationsResponse(val conversations: List<Conversation> = emptyList())

@Serializable
data class ConversationResponse(val conversation: Conversation? = null)

@Serializable
data class Conversation(
    val id: String,
    val channel: String = "whatsapp",
    val contact: ConvContact = ConvContact(),
    val stageName: String? = null,
    val aiEnabled: Boolean = false,
    val handoffAt: String? = null,
    val handoffReason: String? = null,
    val lastInboundAt: String? = null,
    val lastMessageAt: String? = null,
    val unreadCount: Int = 0,
    val windowOpen: Boolean = false,
    val windowRemainingMs: Long = 0,
    val humanWindow: HumanWindow? = null,
    val composer: Composer = Composer(),
    val preview: String? = null,
) {
    /** Se le puede escribir texto libre (ventana normal o humana abierta). */
    val canReply: Boolean get() = windowOpen || humanWindow?.open == true
    /** Pide a una persona: el agente se la pasó o está apagado para ella. */
    val needsHuman: Boolean get() = handoffAt != null
}

@Serializable
data class ConvContact(val id: String = "", val name: String = "", val phone: String? = null)

@Serializable
data class HumanWindow(val open: Boolean = false, val remainingMs: Long = 0)

@Serializable
data class Composer(val media: Boolean = true, val structured: Boolean = true, val quoteReply: Boolean = true)

@Serializable
data class MessagesResponse(val messages: List<Message> = emptyList())

@Serializable
data class Message(
    val id: String,
    val conversationId: String = "",
    val direction: String = "in",
    val type: String = "text",
    val text: String? = null,
    val status: String = "sent",
    val error: String? = null,
    val aiGenerated: Boolean = false,
    val origin: String = "operator",
    val media: MessageMedia? = null,
    val quotable: Boolean = false,
    val replyTo: QuotedMessage? = null,
    val createdAt: String = "",
) {
    val incoming: Boolean get() = direction == "in"
}

@Serializable
data class MessageMedia(
    val assetId: String,
    val kind: String,
    val mimeType: String? = null,
    val fileName: String? = null,
    val fileSize: Long? = null,
    val caption: String? = null,
    val fetchStatus: String = "available",
    val payload: JsonElement? = null,
)

@Serializable
data class QuotedMessage(
    val id: String? = null,
    val direction: String? = null,
    val type: String? = null,
    val text: String? = null,
    val mediaKind: String? = null,
)

@Serializable
data class SendTextBody(val text: String, val replyToMessageId: String? = null)

@Serializable
data class PatchConversationBody(
    val aiEnabled: Boolean? = null,
    val reactivate: Boolean? = null,
    val markRead: Boolean? = null,
)

/* ---------- Notas internas ---------- */

@Serializable
data class NotasResponse(val notas: List<Nota> = emptyList())

@Serializable
data class NotaResponse(val nota: Nota? = null)

@Serializable
data class Nota(
    val id: String,
    val conversationId: String = "",
    val texto: String = "",
    val createdAt: String = "",
    val autor: NotaAutor? = null,
    val puedeBorrar: Boolean = false,
)

@Serializable
data class NotaAutor(val id: String = "", val nombre: String = "")

@Serializable
data class NotaBody(val texto: String)

/* ---------- Respuestas rápidas y plantillas ---------- */

@Serializable
data class RespuestasResponse(val respuestas: List<RespuestaRapida> = emptyList())

@Serializable
data class RespuestaRapida(val id: String, val atajo: String = "", val texto: String = "")

@Serializable
data class TemplatesResponse(val templates: List<Template> = emptyList())

@Serializable
data class Template(
    val id: String,
    val name: String = "",
    val language: String = "",
    val category: String = "",
    val body: String = "",
    val status: String = "draft",
) {
    /** Cuántas variables {{n}} pide el cuerpo. */
    val variableCount: Int
        get() = Regex("\\{\\{\\s*(\\d+)\\s*\\}\\}").findAll(body)
            .mapNotNull { it.groupValues[1].toIntOrNull() }.maxOrNull() ?: 0
}

@Serializable
data class SendTemplateBody(val templateId: String, val variables: List<String>? = null)

@Serializable
data class StartConversationResponse(val messageId: String? = null, val conversationId: String? = null)

/* ---------- Contactos ---------- */

@Serializable
data class ContactsResponse(val contacts: List<Contact> = emptyList())

@Serializable
data class Contact(
    val id: String,
    val name: String = "",
    val phone: String? = null,
    val notes: String? = null,
    val stageName: String? = null,
    val archivedAt: String? = null,
    val priority: String? = null,
    val ficha: JsonObject? = null,
    val aiPaused: Boolean? = null,
)

@Serializable
data class ContactDetailResponse(
    val contact: Contact,
    val stage: Stage? = null,
    val lead: LeadRef? = null,
)

@Serializable
data class LeadRef(val id: String)

@Serializable
data class ContactSaved(val contact: Contact)

@Serializable
data class CreateContactBody(val name: String, val phone: String, val notes: String? = null)

@Serializable
data class PatchContactBody(
    val name: String? = null,
    val notes: String? = null,
    val aiPaused: Boolean? = null,
    val ficha: JsonObject? = null,
)

/* ---------- Embudo ---------- */

@Serializable
data class Stage(val id: String, val name: String = "", val position: Int = 0, val kind: String = "open")

@Serializable
data class BoardResponse(
    val currency: String = "MXN",
    val stages: List<Stage> = emptyList(),
    val leads: List<Lead> = emptyList(),
)

@Serializable
data class Lead(
    val id: String,
    val stageId: String,
    val position: Int = 0,
    val lastActivityAt: String? = null,
    val amountCents: Long? = null,
    val currency: String? = null,
    val priority: String? = null,
    val contact: ConvContact = ConvContact(),
    val conversationId: String? = null,
)

@Serializable
data class PatchLeadBody(
    val stageId: String? = null,
    val lossReason: String? = null,
    val priority: String? = null,
)

/* ---------- Citas ---------- */

@Serializable
data class BookingsResponse(val bookings: List<Booking> = emptyList())

@Serializable
data class Booking(
    val id: String,
    val kind: String = "session",
    val status: String = "agendada",
    val scheduledAtUtc: String = "",
    val durationMinutes: Int = 0,
    val date: String = "",
    val time: String = "",
    val weekday: String = "",
    val contact: ConvContact? = null,
    val conversationId: String? = null,
    val meetingLink: String? = null,
    val isTest: Boolean = false,
    val notes: String? = null,
)

/* ---------- Tiempo real (SSE /api/events) ---------- */

@Serializable
data class MessageNewEvent(val conversationId: String, val message: Message)

@Serializable
data class ConversationUpdatedEvent(val conversation: JsonObject)

@Serializable
data class NoteNewEvent(val conversationId: String, val note: Nota? = null)
