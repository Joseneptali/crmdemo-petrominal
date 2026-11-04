package com.syrtel.crm

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.syrtel.crm.data.Api
import com.syrtel.crm.data.Live
import com.syrtel.crm.data.Prefs
import com.syrtel.crm.notify.AppState
import com.syrtel.crm.notify.Notifier
import kotlinx.coroutines.flow.MutableStateFlow

class App : Application(), ImageLoaderFactory {
    lateinit var prefs: Prefs
    lateinit var api: Api
    lateinit var live: Live
    lateinit var notifier: Notifier

    /** Se pone en false cuando el CRM responde 401: la UI vuelve al login. */
    val loggedIn = MutableStateFlow(false)

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        api = Api(this, prefs)
        live = Live(api)
        notifier = Notifier(this, api, live)
        loggedIn.value = api.hasSession()
        api.onUnauthorized = { loggedIn.value = false }

        // Con la app en pantalla, conexión en vivo siempre abierta.
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                AppState.foreground = true
                live.acquire("pantalla")
            }

            override fun onStop(owner: LifecycleOwner) {
                AppState.foreground = false
                live.release("pantalla")
            }
        })
    }

    /** Coil comparte el cliente HTTP: las imágenes del CRM necesitan la sesión. */
    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this).okHttpClient(api.http).crossfade(true).build()
}
