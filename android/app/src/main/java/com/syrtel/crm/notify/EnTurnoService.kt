package com.syrtel.crm.notify

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.syrtel.crm.App
import com.syrtel.crm.MainActivity
import com.syrtel.crm.R

/**
 * Modo «En turno»: mantiene abierta la conexión en vivo con el CRM aunque la
 * app esté cerrada, para avisar al instante de cada cliente. No usa Firebase
 * ni ningún servicio de terceros: el aviso sale del propio CRM (SSE).
 */
class EnTurnoService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val app = application as App
        if (intent?.action == ACTION_STOP || !app.api.hasSession()) {
            app.live.release(OWNER)
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, EnTurnoService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, Notifier.CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_chat)
            .setContentTitle("En turno")
            .setContentText("Recibirás al instante los mensajes de tus clientes")
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(0, "Salir de turno", stop)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING else 0
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
        app.live.acquire(OWNER)
        return START_STICKY
    }

    override fun onDestroy() {
        (application as App).live.release(OWNER)
        super.onDestroy()
    }

    companion object {
        private const val OWNER = "en_turno"
        private const val NOTIFICATION_ID = 7001
        private const val ACTION_STOP = "stop"

        fun start(context: Context) =
            ContextCompat.startForegroundService(context, Intent(context, EnTurnoService::class.java))

        fun stop(context: Context) {
            context.stopService(Intent(context, EnTurnoService::class.java))
        }
    }
}
