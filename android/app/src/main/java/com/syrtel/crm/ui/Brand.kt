package com.syrtel.crm.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/*
 * El logo de Syrtel dibujado con código (no una imagen) para poder animarlo.
 * Las medidas salen del logo oficial en un lienzo de 512: burbuja crema,
 * trazo diagonal naranja y punto naranja.
 */
private object LogoGeo {
    const val L = 121f; const val T = 121f; const val R = 390f; const val B = 341f
    const val RADIUS = 52f
    val tail = listOf(Offset(146f, 318f), Offset(146f, 384f), Offset(208f, 340f), Offset(170f, 340f))
    val lineStart = Offset(186f, 285f)
    val lineEnd = Offset(279f, 191f)
    const val STROKE = 19f
    val dot = Offset(310f, 165f)
    const val DOT_R = 23f
    // Caja del dibujo, para centrarlo en el lienzo.
    const val CX = 255.5f; const val CY = 252.5f; const val SPAN = 270f
}

/**
 * El logo. [bubble], [line] y [dot] van de 0 a 1 y permiten animar cada
 * parte por separado (1, 1, 1 = el logo completo y quieto).
 */
@Composable
fun LogoMark(
    size: Dp,
    modifier: Modifier = Modifier,
    bubble: Float = 1f,
    line: Float = 1f,
    dot: Float = 1f,
    bubbleColor: Color = Crema,
    accent: Color = Naranja,
) {
    Canvas(modifier.size(size)) { drawLogo(bubble, line, dot, bubbleColor, accent) }
}

private fun DrawScope.drawLogo(bubble: Float, line: Float, dot: Float, bubbleColor: Color, accent: Color) {
    val k = this.size.minDimension / LogoGeo.SPAN
    withTransform({
        translate(this@drawLogo.size.width / 2f - LogoGeo.CX * k, this@drawLogo.size.height / 2f - LogoGeo.CY * k)
        scale(k, k, pivot = Offset.Zero)
    }) {
        if (bubble > 0f) withTransform({ scale(bubble, bubble, pivot = Offset(LogoGeo.CX, LogoGeo.CY)) }) {
            val a = bubble.coerceIn(0f, 1f)
            drawRoundRect(
                bubbleColor.copy(alpha = a),
                topLeft = Offset(LogoGeo.L, LogoGeo.T),
                size = Size(LogoGeo.R - LogoGeo.L, LogoGeo.B - LogoGeo.T),
                cornerRadius = CornerRadius(LogoGeo.RADIUS)
            )
            val p = Path().apply {
                moveTo(LogoGeo.tail[0].x, LogoGeo.tail[0].y)
                LogoGeo.tail.drop(1).forEach { lineTo(it.x, it.y) }
                close()
            }
            drawPath(p, bubbleColor.copy(alpha = a))
        }
        if (line > 0f) {
            val end = Offset(
                LogoGeo.lineStart.x + (LogoGeo.lineEnd.x - LogoGeo.lineStart.x) * line.coerceIn(0f, 1f),
                LogoGeo.lineStart.y + (LogoGeo.lineEnd.y - LogoGeo.lineStart.y) * line.coerceIn(0f, 1f)
            )
            drawLine(accent, LogoGeo.lineStart, end, strokeWidth = LogoGeo.STROKE, cap = StrokeCap.Round)
        }
        if (dot > 0f) drawCircle(accent, LogoGeo.DOT_R * dot, LogoGeo.dot)
    }
}

/**
 * Entrada de la app: la burbuja aparece con rebote, el trazo naranja se
 * dibuja y el punto cae en su lugar; luego el nombre. Llama a [onDone] al
 * terminar (~1.6 s).
 */
@Composable
fun AnimatedSplash(onDone: () -> Unit) {
    val bubble = remember { Animatable(0f) }
    val line = remember { Animatable(0f) }
    val dot = remember { Animatable(0f) }
    val title = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        launch { bubble.animateTo(1f, spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessLow)) }
        delay(280)
        line.animateTo(1f, tween(420, easing = FastOutSlowInEasing))
        launch { dot.animateTo(1f, spring(dampingRatio = 0.4f, stiffness = Spring.StiffnessMedium)) }
        delay(160)
        title.animateTo(1f, tween(380))
        delay(450)
        onDone()
    }
    Box(Modifier.fillMaxSize().background(Tinta), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            LogoMark(132.dp, bubble = bubble.value, line = line.value, dot = dot.value)
            Spacer(Modifier.height(22.dp))
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.alpha(title.value)
            ) {
                Text("Syrtel", color = Crema, fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
                Text("CRM", color = NaranjaClaro, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 4.sp)
            }
        }
    }
}

/**
 * Indicador de carga con el logo: el trazo se dibuja, el punto late y el
 * trazo se recoge, en bucle.
 */
@Composable
fun LogoLoader(size: Dp = 56.dp, onDark: Boolean = false) {
    val t = rememberInfiniteTransition(label = "loader")
    val line by t.animateFloat(
        0f, 1f,
        infiniteRepeatable(
            keyframes {
                durationMillis = 1400
                0f at 0 using FastOutSlowInEasing
                1f at 520 using LinearEasing
                1f at 950 using FastOutSlowInEasing
                0f at 1400
            }, RepeatMode.Restart
        ), label = "line"
    )
    val dot by t.animateFloat(
        0.6f, 1f,
        infiniteRepeatable(
            keyframes {
                durationMillis = 1400
                0.6f at 0
                0.6f at 480
                1.25f at 640 using FastOutSlowInEasing
                1f at 800
                1f at 1100
                0.6f at 1400
            }, RepeatMode.Restart
        ), label = "dot"
    )
    LogoMark(
        size, line = line, dot = dot,
        bubbleColor = if (onDark) Crema else Tinta,
        accent = if (onDark) Naranja else NaranjaClaro
    )
}
