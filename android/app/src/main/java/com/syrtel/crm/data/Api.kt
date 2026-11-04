package com.syrtel.crm.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.net.URLEncoder
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.TimeUnit

/** Error de la API con el mensaje en lenguaje llano que manda el CRM. */
class ApiException(val status: Int, val code: String, message: String) : Exception(message)

val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    encodeDefaults = false
}

/**
 * Cliente de la API de Vocero CRM. Usa la MISMA superficie que la web
 * (`/api/*` con la cookie de sesión de Better Auth): no hace falta tocar el
 * servidor ni crear llaves nuevas, y cada asesor entra con su usuario.
 */
class Api(private val context: Context, val prefs: Prefs) {
    val cookieJar = PersistentCookieJar(prefs)

    val http: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    /** Cliente para SSE: sin timeout de lectura (el servidor manda ping ~25s). */
    val sseHttp: OkHttpClient = http.newBuilder()
        .readTimeout(0, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    val base: String get() = prefs.server

    fun url(path: String) = base + path

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    /* ------------------------------------------------------------------ */
    /* Sesión                                                              */
    /* ------------------------------------------------------------------ */

    @Serializable
    private data class SignInBody(val email: String, val password: String, val rememberMe: Boolean = true)

    suspend fun signIn(server: String, email: String, password: String): SessionUser = io {
        prefs.server = server
        cookieJar.clear()
        val body = json.encodeToString(SignInBody(email.trim(), password)).toRequestBody(jsonType)
        // Sin cookies previas Better Auth no exige Origin; si esta versión lo
        // pide igual, se reintenta con el origen del propio CRM.
        var res = http.newCall(Request.Builder().url(url("/api/auth/sign-in/email")).post(body).build()).execute()
        if (res.code == 403) {
            res.close()
            res = http.newCall(
                Request.Builder().url(url("/api/auth/sign-in/email")).post(body)
                    .header("Origin", base).build()
            ).execute()
        }
        res.use {
            if (!it.isSuccessful) {
                val msg = when (it.code) {
                    401 -> "Correo o contraseña incorrectos"
                    429 -> "Demasiados intentos; espera unos minutos"
                    403 -> "El CRM rechazó el acceso desde la app (origen no permitido)"
                    else -> parseError(it).message.ifBlank { "No se pudo iniciar sesión (${it.code})" }
                }
                throw ApiException(it.code, "sign_in", msg)
            }
        }
        // Confirma que el usuario pertenece a la organización del CRM.
        getConversations()
        val user = getJson<SessionResponse>("/api/auth/get-session").user
            ?: throw ApiException(401, "unauthorized", "No se pudo abrir la sesión")
        prefs.email = email.trim()
        prefs.userName = user.name
        user
    }

    suspend fun signOut() = io {
        runCatching {
            http.newCall(
                Request.Builder().url(url("/api/auth/sign-out"))
                    .post("{}".toRequestBody(jsonType))
                    .header("Origin", base).build()
            ).execute().close()
        }
        cookieJar.clear()
    }

    fun hasSession() = cookieJar.hasSession()

    /* ------------------------------------------------------------------ */
    /* Bandeja                                                             */
    /* ------------------------------------------------------------------ */

    suspend fun getConversations(since: String? = null): List<Conversation> =
        getJson<ConversationsResponse>(
            "/api/conversations" + (since?.let { "?since=" + enc(it) } ?: "")
        ).conversations

    suspend fun getMessages(conversationId: String): List<Message> =
        getJson<MessagesResponse>("/api/conversations/$conversationId/messages").messages

    suspend fun sendText(conversationId: String, text: String, replyTo: String? = null) {
        postJson<Unit>("/api/conversations/$conversationId/messages", json.encodeToString(SendTextBody(text, replyTo)))
    }

    suspend fun sendMedia(conversationId: String, uri: Uri, caption: String?) = io {
        val resolver = context.contentResolver
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        } ?: "archivo"
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw ApiException(0, "read", "No se pudo leer el archivo")
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", name, bytes.toRequestBody(mime.toMediaType()))
            .apply { if (!caption.isNullOrBlank()) addFormDataPart("caption", caption) }
            .build()
        execute(Request.Builder().url(url("/api/conversations/$conversationId/messages/media")).post(form).build())
            .close()
    }

    suspend fun sendTemplate(conversationId: String, templateId: String, variables: List<String>) {
        postJson<Unit>(
            "/api/conversations/$conversationId/messages/template",
            json.encodeToString(SendTemplateBody(templateId, variables.ifEmpty { null }))
        )
    }

    suspend fun patchConversation(id: String, body: PatchConversationBody): Conversation? =
        send<ConversationResponse>("PATCH", "/api/conversations/$id", json.encodeToString(body)).conversation

    suspend fun getNotas(conversationId: String): List<Nota> =
        getJson<NotasResponse>("/api/conversations/$conversationId/notes").notas

    suspend fun addNota(conversationId: String, texto: String) {
        postJson<NotaResponse>("/api/conversations/$conversationId/notes", json.encodeToString(NotaBody(texto)))
    }

    suspend fun deleteNota(conversationId: String, notaId: String) {
        send<Unit>("DELETE", "/api/conversations/$conversationId/notes/$notaId", null)
    }

    suspend fun getRespuestas(): List<RespuestaRapida> =
        getJson<RespuestasResponse>("/api/quick-replies").respuestas

    suspend fun getTemplates(): List<Template> =
        getJson<TemplatesResponse>("/api/templates").templates.filter { it.status == "approved" }

    /** Descarga un adjunto a la caché para abrirlo con otra app. */
    suspend fun downloadMedia(media: MessageMedia): File = io {
        val dir = File(context.cacheDir, "adjuntos").apply { mkdirs() }
        val ext = media.fileName?.substringAfterLast('.', "")?.takeIf { it.isNotBlank() }
            ?: media.mimeType?.substringAfter('/')?.substringBefore(';') ?: "bin"
        val safeName = (media.fileName ?: "${media.assetId}.$ext").replace(Regex("[^\\w.\\- ]"), "_")
        val out = File(dir, safeName)
        if (!out.exists() || out.length() == 0L) {
            execute(Request.Builder().url(mediaUrl(media.assetId)).get().build()).use { res ->
                res.body?.byteStream()?.use { input -> out.outputStream().use { input.copyTo(it) } }
            }
        }
        out
    }

    fun mediaUrl(assetId: String) = url("/api/media/$assetId")

    /* ------------------------------------------------------------------ */
    /* Contactos                                                           */
    /* ------------------------------------------------------------------ */

    suspend fun getContacts(q: String?): List<Contact> =
        getJson<ContactsResponse>("/api/contacts" + (q?.takeIf { it.isNotBlank() }?.let { "?q=" + enc(it) } ?: "")).contacts

    suspend fun getContact(id: String): ContactDetailResponse = getJson("/api/contacts/$id")

    suspend fun createContact(name: String, phone: String, notes: String?): Contact =
        postJson<ContactSaved>("/api/contacts", json.encodeToString(CreateContactBody(name, phone, notes))).contact

    suspend fun patchContact(id: String, body: PatchContactBody): Contact =
        send<ContactSaved>("PATCH", "/api/contacts/$id", json.encodeToString(body)).contact

    /** Escribe a un contacto fuera de ventana con una plantilla aprobada. */
    suspend fun startConversation(contactId: String, templateId: String, variables: List<String>): StartConversationResponse =
        postJson(
            "/api/contacts/$contactId/start-conversation",
            json.encodeToString(SendTemplateBody(templateId, variables.ifEmpty { null }))
        )

    /* ------------------------------------------------------------------ */
    /* Embudo y citas                                                      */
    /* ------------------------------------------------------------------ */

    suspend fun getBoard(): BoardResponse = getJson("/api/pipeline/board")

    suspend fun patchLead(id: String, body: PatchLeadBody) {
        send<Unit>("PATCH", "/api/pipeline/leads/$id", json.encodeToString(body))
    }

    /** null = la agenda no está activada en este CRM (la ruta responde 404). */
    suspend fun getBookings(days: Long = 30): List<Booking>? {
        val today = Instant.now().truncatedTo(ChronoUnit.DAYS)
        val from = today.toString().substring(0, 10)
        val to = today.plus(days, ChronoUnit.DAYS).toString().substring(0, 10)
        return try {
            getJson<BookingsResponse>("/api/bookings?from=$from&to=$to").bookings
        } catch (e: ApiException) {
            if (e.status == 404) null else throw e
        }
    }

    /* ------------------------------------------------------------------ */
    /* Transporte                                                          */
    /* ------------------------------------------------------------------ */

    private suspend inline fun <reified T> getJson(path: String): T = io {
        execute(Request.Builder().url(url(path)).get().build()).use { decode(it) }
    }

    private suspend inline fun <reified T> postJson(path: String, body: String): T = send("POST", path, body)

    private suspend inline fun <reified T> send(method: String, path: String, body: String?): T = io {
        val rb: RequestBody? = body?.toRequestBody(jsonType)
        execute(Request.Builder().url(url(path)).method(method, rb).build()).use { decode(it) }
    }

    private inline fun <reified T> decode(res: Response): T {
        if (T::class == Unit::class) return Unit as T
        val text = res.body?.string().orEmpty()
        return json.decodeFromString(text)
    }

    /** Ejecuta y convierte cualquier respuesta no-2xx en ApiException. */
    private fun execute(req: Request): Response {
        val res = try {
            http.newCall(req).execute()
        } catch (e: IOException) {
            throw ApiException(0, "network", "Sin conexión con el CRM. Revisa tu internet.")
        }
        if (res.isSuccessful) return res
        val detail = parseError(res)
        res.close()
        if (res.code == 401) { cookieJar.clear(); onUnauthorized?.invoke() }
        throw ApiException(
            res.code, detail.code,
            detail.message.ifBlank {
                when (res.code) {
                    401 -> "Tu sesión terminó. Vuelve a entrar."
                    403 -> "No tienes permiso para esto."
                    404 -> "No encontrado"
                    else -> "Error del CRM (${res.code})"
                }
            }
        )
    }

    private fun parseError(res: Response): ApiErrorDetail = runCatching {
        json.decodeFromString<ApiErrorBody>(res.peekBody(64_000).string()).error
    }.getOrNull() ?: ApiErrorDetail()

    /** Lo engancha la app para volver al login cuando la sesión caduca. */
    @Volatile
    var onUnauthorized: (() -> Unit)? = null

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private suspend fun <T> io(block: suspend () -> T): T = withContext(Dispatchers.IO) { block() }
}
