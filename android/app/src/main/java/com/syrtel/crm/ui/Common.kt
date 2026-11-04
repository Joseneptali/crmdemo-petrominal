package com.syrtel.crm.ui

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.syrtel.crm.App
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

val Acento = Color(0xFF0D5BFF)
val Verde = Color(0xFF1A9E5C)
val Ambar = Color(0xFFD98B00)
val Rojo = Color(0xFFD93636)

@Composable
fun SyrtelTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val scheme = if (dark) darkColorScheme(
        primary = Color(0xFF6E9BFF), onPrimary = Color.White,
        primaryContainer = Color(0xFF1B2E5C), onPrimaryContainer = Color(0xFFDCE6FF),
        background = Color(0xFF0F1115), surface = Color(0xFF16191F),
        surfaceVariant = Color(0xFF232731), onSurfaceVariant = Color(0xFFB4BAC6),
    ) else lightColorScheme(
        primary = Acento, onPrimary = Color.White,
        primaryContainer = Color(0xFFDCE6FF), onPrimaryContainer = Color(0xFF0A2A73),
        background = Color(0xFFF6F7F9), surface = Color.White,
        surfaceVariant = Color(0xFFEDEFF3), onSurfaceVariant = Color(0xFF5B6270),
    )
    MaterialTheme(colorScheme = scheme, content = content)
}

@Composable
fun app(): App = LocalContext.current.applicationContext as App

private val zone: ZoneId get() = ZoneId.systemDefault()
private val es = Locale("es")

/** «14:05», «ayer», «lun», «12 oct» según qué tan reciente sea. */
fun shortTime(iso: String?): String {
    val t = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return ""
    val dt = t.atZone(zone)
    val today = LocalDate.now(zone)
    val d = dt.toLocalDate()
    return when {
        d == today -> dt.format(DateTimeFormatter.ofPattern("HH:mm"))
        d == today.minusDays(1) -> "ayer"
        d.isAfter(today.minusDays(7)) -> dt.format(DateTimeFormatter.ofPattern("EEE", es))
        else -> dt.format(DateTimeFormatter.ofPattern("d MMM", es))
    }
}

fun clockTime(iso: String?): String {
    val t = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return ""
    return t.atZone(zone).format(DateTimeFormatter.ofPattern("HH:mm"))
}

fun dayLabel(iso: String?): String {
    val t = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return ""
    val d = t.atZone(zone).toLocalDate()
    val today = LocalDate.now(zone)
    return when (d) {
        today -> "Hoy"
        today.minusDays(1) -> "Ayer"
        else -> d.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", es)).replaceFirstChar { it.uppercase() }
    }
}

fun remaining(ms: Long): String {
    val h = ms / 3_600_000
    val m = (ms / 60_000) % 60
    return if (h > 0) "${h} h ${m} min" else "${m} min"
}

fun money(cents: Long?, currency: String?): String? {
    cents ?: return null
    val f = java.text.NumberFormat.getCurrencyInstance(Locale("es", "CO"))
    runCatching { f.currency = java.util.Currency.getInstance(currency ?: "COP") }
    f.maximumFractionDigits = if (cents % 100 == 0L) 0 else 2
    return f.format(cents / 100.0)
}

fun channelLabel(channel: String) = when (channel) {
    "whatsapp" -> "WhatsApp"
    "instagram" -> "Instagram"
    "messenger" -> "Messenger"
    "tiktok" -> "TikTok"
    else -> channel.replaceFirstChar { it.uppercase() }
}

fun channelColor(channel: String) = when (channel) {
    "whatsapp" -> Color(0xFF25A35A)
    "instagram" -> Color(0xFFC13584)
    "messenger" -> Color(0xFF0A7CFF)
    else -> Color(0xFF6B7280)
}

@Composable
fun Avatar(name: String, size: Dp = 44.dp, color: Color = MaterialTheme.colorScheme.primaryContainer) {
    val initials = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2)
        .joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
    Box(
        Modifier.size(size).background(color, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(
            initials, color = MaterialTheme.colorScheme.onPrimaryContainer,
            fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.36).sp
        )
    }
}

@Composable
fun Chip(text: String, color: Color, modifier: Modifier = Modifier) {
    Surface(color = color.copy(alpha = 0.14f), shape = RoundedCornerShape(50), modifier = modifier) {
        Text(
            text, color = color, fontSize = 11.sp, fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
        )
    }
}

@Composable
fun Loading() = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

@Composable
fun EmptyState(title: String, detail: String? = null, action: String? = null, onAction: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (detail != null) Text(
            detail, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp)
        )
        if (action != null && onAction != null) Button(onClick = onAction, modifier = Modifier.padding(top = 16.dp)) { Text(action) }
    }
}

@Composable
fun ErrorBar(message: String?) {
    if (message == null) return
    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
        Text(
            message, color = MaterialTheme.colorScheme.onErrorContainer,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp), fontSize = 13.sp
        )
    }
}

fun dial(context: Context, phone: String) {
    context.startActivity(Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:+${phone.filter { it.isDigit() }}")))
}
