# App Android — Syrtel CRM

App nativa (Kotlin + Jetpack Compose) para atender clientes desde el celular
con el **mismo usuario del CRM**. Usa la API interna de Vocero (`/api/*`) con la
cookie de sesión de Better Auth, igual que la web: no requiere cambios en el
servidor ni llaves nuevas.

## Qué hace

- **Bandeja**: conversaciones en tiempo real (SSE `/api/events`), filtros
  *Sin leer · Requieren atención · Ventana abierta*, búsqueda sin acentos.
- **Chat**: texto, adjuntos (foto/documento), respuestas rápidas, responder
  citando, plantillas cuando la ventana de 24 h está cerrada, tomar la
  conversación o devolverla al agente IA, notas internas del equipo.
- **Contactos y ficha**: buscar, crear, editar nombre/notas/ficha de
  calificación, pausar el agente para una persona, llamar, escribir con
  plantilla.
- **Embudo**: etapas como pestañas, mover tratos (con motivo de pérdida),
  prioridad.
- **Citas**: próximos 30 días (si la bandera `AGENDA` está activa).
- **Avisos**: interruptor **En turno** = conexión en vivo con avisos al
  instante aunque la app esté cerrada (servicio en primer plano). Fuera de
  turno, una revisión cada ~15 min. Sin Firebase ni terceros (constitución II).

## Instalar

Cada push a `android/` compila el APK con GitHub Actions y lo publica en el
release **app-android** del repo:
`https://github.com/<owner>/<repo>/releases/tag/app-android`.
En el celular: descargar `SyrtelCRM.apk` → permitir «instalar apps de origen
desconocido» → abrir. Las versiones nuevas se instalan encima.

## Firma

El APK se firma con `android/keystore/syrtel-crm.jks` para que las
actualizaciones se instalen sin desinstalar. **Para producción o Play Store**
crea un keystore propio y guárdalo como secretos del repo
(`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`);
el workflow lo usa automáticamente en vez del del repo.

## Cambiar el CRM por defecto

La dirección del CRM se puede cambiar en la pantalla de entrada
(«Cambiar dirección del CRM»). Para compilar con otra por defecto, define
`CRM_URL` en el workflow.
