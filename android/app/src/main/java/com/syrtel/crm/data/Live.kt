package com.syrtel.crm.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.time.Instant

/** Un evento del CRM: del canal SSE (`message.new`…) o de la sincronización (`sync`). */
data class LiveEvent(val type: String, val data: String, val changed: List<Conversation> = emptyList())

/** Cómo está la conexión con el CRM, para mostrarlo en pantalla. */
enum class LinkState { OFFLINE, SYNCING, LIVE }

/**
 * Tiempo real con dos vías independientes:
 *
 * 1. **SSE** (`/api/events`): instantáneo cuando el servidor lo entrega.
 * 2. **Sincronización**: cada pocos segundos pregunta qué conversaciones
 *    cambiaron desde la última vuelta (`/api/conversations?since=`, con la
 *    hora del servidor). No depende del proxy ni de la versión del CRM, y
 *    una vuelta sin cambios pesa unos pocos bytes.
 *
 * Quien la necesita la pide con un intervalo (la app en pantalla, rápido; el
 * modo En turno, más espaciado) y se usa el más corto de los pedidos.
 */
class Live(private val api: Api) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val owners = mutableMapOf<String, Long>()
    private var sseJob: Job? = null
    private var syncJob: Job? = null

    private val _events = MutableSharedFlow<LiveEvent>(extraBufferCapacity = 128)
    val events: SharedFlow<LiveEvent> = _events

    private val _sse = MutableStateFlow(false)
    /** El canal SSE está abierto. */
    val connected: StateFlow<Boolean> = _sse

    private val _state = MutableStateFlow(LinkState.OFFLINE)
    val state: StateFlow<LinkState> = _state

    @Volatile private var lastSyncOk = false

    @Synchronized
    fun acquire(owner: String, intervalMs: Long) {
        owners[owner] = intervalMs
        if (sseJob?.isActive != true) sseJob = scope.launch { sseLoop() }
        if (syncJob?.isActive != true) syncJob = scope.launch { syncLoop() }
    }

    @Synchronized
    fun release(owner: String) {
        owners -= owner
        if (owners.isEmpty()) {
            sseJob?.cancel(); sseJob = null
            syncJob?.cancel(); syncJob = null
            _sse.value = false
            lastSyncOk = false
            updateState()
        }
    }

    /** Pide una vuelta de sincronización ya (al abrir la app, tras enviar…). */
    fun nudge() { pendingNudge = true }

    @Volatile private var pendingNudge = false

    private fun interval(): Long = synchronized(this) { owners.values.minOrNull() ?: 15_000L }

    private fun updateState() {
        _state.value = when {
            _sse.value -> LinkState.LIVE
            lastSyncOk -> LinkState.SYNCING
            else -> LinkState.OFFLINE
        }
    }

    /* ---------------------------- sincronización ---------------------------- */

    private suspend fun syncLoop() {
        var since: String? = null
        var first = true
        while (true) {
            if (api.hasSession()) {
                try {
                    val (changed, serverNow) = api.syncConversations(since)
                    lastSyncOk = true
                    if (first || changed.isNotEmpty()) {
                        _events.tryEmit(LiveEvent(if (first) "sync.initial" else "sync", "", changed))
                    }
                    first = false
                    // 3 s de solape: el header Date va al segundo y nada se pierde
                    // entre una vuelta y otra (los repetidos se ignoran).
                    since = runCatching { Instant.parse(serverNow).minusSeconds(3).toString() }.getOrNull()
                } catch (e: ApiException) {
                    lastSyncOk = false
                    if (e.status == 401) since = null
                }
                updateState()
            }
            // Espera el intervalo, pero despierta antes si alguien pide una vuelta.
            val until = System.currentTimeMillis() + interval()
            while (System.currentTimeMillis() < until && !pendingNudge) delay(250)
            pendingNudge = false
        }
    }

    /* --------------------------------- SSE ---------------------------------- */

    private suspend fun sseLoop() {
        var backoff = 2_000L
        var first = true
        while (true) {
            if (!api.hasSession()) {
                delay(5_000)
                continue
            }
            val failure = runOnce(opened = {
                backoff = 2_000L
                _sse.value = true
                updateState()
                if (!first) _events.tryEmit(LiveEvent("reconnected", "{}"))
                first = false
            })
            _sse.value = false
            updateState()
            if (failure == 401) { api.cookieJar.clear(); api.onUnauthorized?.invoke() }
            // Si el servidor no entrega SSE (404, proxy que lo corta…), la
            // sincronización cubre; se reintenta sin prisa.
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(60_000L)
        }
    }

    /** Abre una conexión y suspende hasta que se cierre. Devuelve el código HTTP de fallo, si hubo. */
    private suspend fun runOnce(opened: () -> Unit): Int? = suspendCancellableCoroutine { cont ->
        val request = Request.Builder().url(api.url("/api/events"))
            .header("Accept", "text/event-stream")
            // Sin gzip: un proxy que comprime el stream lo retiene hasta el final.
            .header("Accept-Encoding", "identity")
            .build()
        val source = EventSources.createFactory(api.sseHttp).newEventSource(request, object : EventSourceListener() {
            override fun onOpen(eventSource: EventSource, response: Response) = opened()

            override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                if (type != null) {
                    _events.tryEmit(LiveEvent(type, data))
                    // Algo cambió: la sincronización trae el estado completo enseguida.
                    if (type.startsWith("message.") || type.startsWith("conversation.")) nudge()
                }
            }

            override fun onClosed(eventSource: EventSource) {
                if (cont.isActive) cont.resumeWith(Result.success(null))
            }

            override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                if (cont.isActive) cont.resumeWith(Result.success(response?.code))
            }
        })
        cont.invokeOnCancellation { source.cancel() }
    }
}
