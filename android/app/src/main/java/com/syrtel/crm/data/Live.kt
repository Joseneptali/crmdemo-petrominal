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

/** Un evento del canal `/api/events` del CRM (contrato sse.md). */
data class LiveEvent(val type: String, val data: String)

/**
 * Conexión en vivo con el CRM. Se mantiene abierta mientras alguien la pida
 * (la app en pantalla o el modo «En turno») y se reconecta sola con espera
 * creciente. El servidor no repite eventos perdidos: quien escucha hace
 * catch-up refrescando al recibir `reconnected`.
 */
class Live(private val api: Api) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val owners = mutableSetOf<String>()
    private var job: Job? = null

    private val _events = MutableSharedFlow<LiveEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<LiveEvent> = _events

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected

    @Synchronized
    fun acquire(owner: String) {
        owners += owner
        if (job?.isActive != true) job = scope.launch { loop() }
    }

    @Synchronized
    fun release(owner: String) {
        owners -= owner
        if (owners.isEmpty()) {
            job?.cancel()
            job = null
            _connected.value = false
        }
    }

    private suspend fun loop() {
        var backoff = 1_000L
        var first = true
        while (true) {
            if (!api.hasSession()) {
                delay(5_000)
                continue
            }
            val failure = runOnce(opened = {
                backoff = 1_000L
                _connected.value = true
                if (!first) _events.tryEmit(LiveEvent("reconnected", "{}"))
                first = false
            })
            _connected.value = false
            if (failure == 401) { api.cookieJar.clear(); api.onUnauthorized?.invoke() }
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(30_000L)
        }
    }

    /** Abre una conexión y suspende hasta que se cierre. Devuelve el código HTTP de fallo, si hubo. */
    private suspend fun runOnce(opened: () -> Unit): Int? = suspendCancellableCoroutine { cont ->
        val request = Request.Builder().url(api.url("/api/events"))
            .header("Accept", "text/event-stream").build()
        val source = EventSources.createFactory(api.sseHttp).newEventSource(request, object : EventSourceListener() {
            override fun onOpen(eventSource: EventSource, response: Response) = opened()

            override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                if (type != null) _events.tryEmit(LiveEvent(type, data))
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
