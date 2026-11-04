package com.syrtel.crm.ui

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
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

/* ------------------------------------------------------------------------ */
/* Marca Syrtel (colores tomados del logo oficial)                           */
/* ------------------------------------------------------------------------ */

/** Verde tinta: fondo del logo, barras y textos principales. */
val Tinta = Color(0xFF101C18)
val Tinta2 = Color(0xFF16241F)
val Tinta3 = Color(0xFF1F2F28)
/** Crema: la burbuja del logo y el fondo claro de la app. */
val Crema = Color(0xFFFBF9F4)
/** Naranja de marca: logo, iconos y acentos (no para texto pequeño sobre claro). */
val Naranja = Color(0xFFE25B16)
/** Naranja profundo para botones con texto blanco (contraste 4.9:1). */
val NaranjaBoton = Color(0xFFC24A0E)
/** Naranja claro: acento sobre fondos oscuros (6.3:1 sobre Tinta). */
val NaranjaClaro = Color(0xFFF07A3C)

/*
 * Colores de estado. Cada uno tiene versión clara y oscura con contraste
 * ≥ 4.5:1 sobre su fondo (verificado con la fórmula WCAG).
 */
private fun tone(light: Long, dark: Long) = Color(light) to Color(dark)
private val VERDE = tone(0xFF1E7A4C, 0xFF6FD3A0)
private val AMBAR = tone(0xFF8A5A00, 0xFFF2C46B)
private val ROJO = tone(0xFFB42318, 0xFFFF8A80)
private val ACENTO = tone(0xFFA33B0B, 0xFFF28B52)
private val NEUTRO = tone(0xFF3D4A45, 0xFFC9D3CF)

@Composable @ReadOnlyComposable
private fun pick(t: Pair<Color, Color>) = if (isSystemInDarkTheme()) t.second else t.first

val Verde: Color
    @Composable @ReadOnlyComposable get() = pick(VERDE)
val Ambar: Color
    @Composable @ReadOnlyComposable get() = pick(AMBAR)
val Rojo: Color
    @Composable @ReadOnlyComposable get() = pick(ROJO)
val Acento: Color
    @Composable @ReadOnlyComposable get() = pick(ACENTO)
val Neutro: Color
    @Composable @ReadOnlyComposable get() = pick(NEUTRO)

private val LightScheme = lightColorScheme(
    primary = NaranjaBoton, onPrimary = Color.White,
    primaryContainer = Color(0xFFFCE6DA), onPrimaryContainer = Color(0xFF6B2706),
    secondary = Tinta, onSecondary = Crema,
    secondaryContainer = Color(0xFFE6EAE7), onSecondaryContainer = Tinta,
    background = Crema, onBackground = Tinta,
    surface = Color.White, onSurface = Tinta,
    surfaceVariant = Color(0xFFF1EEE6), onSurfaceVariant = Color(0xFF5E6B66),
    surfaceContainer = Color(0xFFF6F3EC), surfaceContainerHigh = Color(0xFFF1EEE6),
    surfaceContainerLow = Color.White, surfaceContainerLowest = Color.White,
    surfaceContainerHighest = Color(0xFFEAE6DC),
    outline = Color(0xFFCFC9BC), outlineVariant = Color(0xFFE6E1D6),
    error = Color(0xFFB42318), onError = Color.White,
    errorContainer = Color(0xFFFDE8E6), onErrorContainer = Color(0xFF7A1810),
)

private val DarkScheme = darkColorScheme(
    primary = NaranjaClaro, onPrimary = Tinta,
    primaryContainer = Color(0xFF4A2410), onPrimaryContainer = Color(0xFFFFD9C4),
    secondary = Crema, onSecondary = Tinta,
    secondaryContainer = Tinta3, onSecondaryContainer = Crema,
    background = Tinta, onBackground = Crema,
    surface = Tinta2, onSurface = Crema,
    surfaceVariant = Tinta3, onSurfaceVariant = Color(0xFF9DAAA4),
    surfaceContainer = Tinta2, surfaceContainerHigh = Tinta3,
    surfaceContainerLow = Tinta2, surfaceContainerLowest = Tinta,
    surfaceContainerHighest = Color(0xFF26372F),
    outline = Color(0xFF3A4B44), outlineVariant = Color(0xFF2A3A33),
    error = Color(0xFFFF8A80), onError = Tinta,
    errorContainer = Color(0xFF5C1710), onErrorContainer = Color(0xFFFFDAD5),
)

private val AppTypography = Typography().let { t ->
    t.copy(
        headlineSmall = t.headlineSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
        titleLarge = t.titleLarge.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.2).sp),
        titleMedium = t.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        bodyLarge = t.bodyLarge.copy(lineHeight = 22.sp),
        labelLarge = t.labelLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.1.sp),
    )
}

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun SyrtelTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkScheme else LightScheme,
        typography = AppTypography,
        shapes = AppShapes,
        content = content
    )
}

@Composable
fun app(): App = LocalContext.current.applicationContext as App

/* ------------------------------------------------------------------------ */
/* Fechas y formatos                                                         */
/* ------------------------------------------------------------------------ */

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

@Composable
fun channelColor(channel: String) = when (channel) {
    "whatsapp" -> Verde
    "instagram" -> Rojo
    "messenger" -> Acento
    else -> Neutro
}

/* ------------------------------------------------------------------------ */
/* Componentes                                                               */
/* ------------------------------------------------------------------------ */

/** Pares fondo/texto del avatar, todos con contraste ≥ 4.5:1. */
private val AVATARS = listOf(
    Color(0xFFFCE6DA) to Color(0xFF6B2706),
    Color(0xFFDDEFE5) to Color(0xFF14532D),
    Color(0xFFE3E9F2) to Color(0xFF1E3A5F),
    Color(0xFFF1EEE6) to Tinta,
    Color(0xFFFBEFD6) to Color(0xFF5C3B00),
    Color(0xFFEDE4F4) to Color(0xFF4A2A6B),
)

@Composable
fun Avatar(name: String, size: Dp = 48.dp, colors: Pair<Color, Color>? = null) {
    val initials = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2)
        .joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
    val (bg, fg) = colors ?: AVATARS[Math.floorMod(name.hashCode(), AVATARS.size)]
    Box(Modifier.size(size).background(bg, CircleShape), contentAlignment = Alignment.Center) {
        Text(initials, color = fg, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.36).sp)
    }
}

/** Etiqueta pequeña: texto del color de estado sobre un fondo suave del mismo tono. */
@Composable
fun Chip(text: String, color: Color, modifier: Modifier = Modifier) {
    Surface(
        color = color.copy(alpha = if (isSystemInDarkTheme()) 0.16f else 0.11f),
        shape = RoundedCornerShape(50), modifier = modifier
    ) {
        Text(
            text, color = color, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
        )
    }
}

/** Carga: el logo animado. */
@Composable
fun Loading() = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    LogoLoader(64.dp, onDark = isSystemInDarkTheme())
}

@Composable
fun EmptyState(title: String, detail: String? = null, action: String? = null, onAction: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        LogoMark(
            72.dp, line = 1f, dot = 1f,
            bubbleColor = MaterialTheme.colorScheme.surfaceContainerHighest,
            accent = MaterialTheme.colorScheme.primary.copy(alpha = 0.55f)
        )
        Text(
            title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground, modifier = Modifier.padding(top = 16.dp)
        )
        if (detail != null) Text(
            detail, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp)
        )
        if (action != null && onAction != null) Button(onClick = onAction, modifier = Modifier.padding(top = 18.dp)) { Text(action) }
    }
}

@Composable
fun ErrorBar(message: String?) {
    if (message == null) return
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.ErrorOutline, null, tint = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.size(18.dp))
            Text(
                message, color = MaterialTheme.colorScheme.onErrorContainer,
                style = TextStyle(fontSize = 13.sp), modifier = Modifier.padding(start = 8.dp)
            )
        }
    }
}

fun dial(context: Context, phone: String) {
    context.startActivity(Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:+${phone.filter { it.isDigit() }}")))
}
