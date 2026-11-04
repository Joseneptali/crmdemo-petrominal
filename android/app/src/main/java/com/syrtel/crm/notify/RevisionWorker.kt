package com.syrtel.crm.notify

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.syrtel.crm.App
import com.syrtel.crm.data.LinkState
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * Respaldo fuera de turno: cada ~15 min (lo mínimo que permite Android)
 * revisa si llegaron mensajes y avisa. Cuando la conexión en vivo está
 * abierta no hace nada, para no avisar dos veces.
 */
class RevisionWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as App
        if (!app.api.hasSession()) return Result.success()
        val now = Instant.now().toString()
        val last = app.prefs.lastCheck
        if (app.live.state.value != LinkState.OFFLINE || last == null) {
            app.prefs.lastCheck = now
            return Result.success()
        }
        return try {
            val changed = app.api.getConversations(since = last)
            app.notifier.remember(changed)
            for (c in changed) {
                val inbound = c.lastInboundAt ?: continue
                val isNew = runCatching { Instant.parse(inbound).isAfter(Instant.parse(last)) }.getOrDefault(false)
                if (c.unreadCount > 0 && isNew) {
                    app.notifier.notifyConversation(
                        c.id,
                        c.contact.name.ifBlank { c.contact.phone ?: "Cliente" },
                        c.preview ?: "Mensaje nuevo",
                        if (c.needsHuman) Notifier.CHANNEL_HANDOFF else Notifier.CHANNEL_MESSAGES,
                        c.unreadCount
                    )
                }
            }
            app.prefs.lastCheck = now
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<RevisionWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork("revision", ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun cancel(context: Context) = WorkManager.getInstance(context).cancelUniqueWork("revision")
    }
}
