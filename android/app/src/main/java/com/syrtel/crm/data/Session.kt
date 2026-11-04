package com.syrtel.crm.data

import android.content.Context
import android.content.SharedPreferences
import com.syrtel.crm.BuildConfig
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * Preferencias de la app. La contraseña NO se guarda: solo la cookie de
 * sesión que entrega Better Auth (igual que el navegador), en el almacén
 * privado de la app.
 */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.getSharedPreferences("syrtel_crm", Context.MODE_PRIVATE)

    var server: String
        get() = sp.getString("server", null) ?: BuildConfig.DEFAULT_SERVER
        set(v) = sp.edit().putString("server", v.trim().trimEnd('/')).apply()

    var email: String
        get() = sp.getString("email", "") ?: ""
        set(v) = sp.edit().putString("email", v).apply()

    var userName: String
        get() = sp.getString("user_name", "") ?: ""
        set(v) = sp.edit().putString("user_name", v).apply()

    /** Modo «En turno»: conexión en vivo y avisos al instante. */
    var enTurno: Boolean
        get() = sp.getBoolean("en_turno", true)
        set(v) = sp.edit().putBoolean("en_turno", v).apply()

    /** Ya se pidió quitar la optimización de batería (una sola vez). */
    var askedBattery: Boolean
        get() = sp.getBoolean("asked_battery", false)
        set(v) = sp.edit().putBoolean("asked_battery", v).apply()

    /** Último momento revisado por el respaldo periódico (ISO-8601). */
    var lastCheck: String?
        get() = sp.getString("last_check", null)
        set(v) = sp.edit().putString("last_check", v).apply()

    internal fun cookieStore(): SharedPreferences = sp
}

/** Guarda las cookies del CRM entre reinicios (la sesión dura días). */
class PersistentCookieJar(private val prefs: Prefs) : CookieJar {
    private val lock = Any()
    private val cookies = mutableListOf<Cookie>()

    init {
        val raw = prefs.cookieStore().getStringSet("cookies", emptySet()).orEmpty()
        for (line in raw) {
            val sep = line.indexOf('\n')
            if (sep <= 0) continue
            val url = HttpUrl.Builder().scheme("https").host(line.substring(0, sep)).build()
            Cookie.parse(url, line.substring(sep + 1))?.let { cookies += it }
        }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) = synchronized(lock) {
        for (c in cookies) {
            this.cookies.removeAll { it.name == c.name && it.domain == c.domain && it.path == c.path }
            if (c.expiresAt > System.currentTimeMillis()) this.cookies += c
        }
        persist()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> = synchronized(lock) {
        val now = System.currentTimeMillis()
        cookies.removeAll { it.expiresAt <= now }
        cookies.filter { it.matches(url) }
    }

    fun hasSession(): Boolean = synchronized(lock) {
        cookies.any { it.name.contains("session_token") && it.expiresAt > System.currentTimeMillis() }
    }

    fun clear() = synchronized(lock) {
        cookies.clear()
        persist()
    }

    private fun persist() {
        val set = cookies.map { "${it.domain}\n${toSetCookie(it)}" }.toSet()
        prefs.cookieStore().edit().putStringSet("cookies", set).apply()
    }

    private fun toSetCookie(c: Cookie): String = buildString {
        append(c.name).append('=').append(c.value)
        if (c.persistent) append("; Max-Age=").append(((c.expiresAt - System.currentTimeMillis()) / 1000).coerceAtLeast(0))
        if (!c.hostOnly) append("; Domain=").append(c.domain)
        append("; Path=").append(c.path)
        if (c.secure) append("; Secure")
        if (c.httpOnly) append("; HttpOnly")
    }
}
