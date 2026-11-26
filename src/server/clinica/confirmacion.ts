import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fechaLarga } from "@/lib/clinica";
import {
  CARPETA_RECOMENDACIONES,
  CONTACTO_CLINICA,
  LOGO_CLINICA,
  RECOMENDACION_CONSULTA,
  TRAER_SIEMPRE,
} from "@/lib/clinica-procedimientos";
import { notaDelSistema } from "@/server/asesores";
import { enviarCorreo } from "@/server/correo";
import { remitente } from "@/server/cotizacion-prueba";

/**
 * Demo clínica — al agendar (o mover) una cita, el paciente recibe la
 * confirmación con el logo de la clínica y las recomendaciones de
 * preparación; si es un examen o procedimiento, también el PDF oficial de la
 * recomendación. Por WhatsApp (si escribe por ahí) y por correo (si lo tiene),
 * desde el correo de la IA. Cada canal es independiente.
 */

const archivoPublico = (relativo: string) => readFile(path.join(process.cwd(), "public", relativo));

type Motivo = "agendada" | "reprogramada";

export async function enviarConfirmacionCita(
  organizationId: string,
  citaId: string,
  opts: { conversationId?: string | null; motivo?: Motivo } = {}
): Promise<void> {
  const db = getDb();
  const [f] = await db
    .select({
      cita: schema.clinicaCita,
      paciente: schema.clinicaPaciente,
      esp: schema.clinicaEspecialidad.nombre,
      prof: schema.clinicaProfesional.nombre,
      proc: schema.clinicaProcedimiento,
    })
    .from(schema.clinicaCita)
    .innerJoin(schema.clinicaPaciente, eq(schema.clinicaCita.pacienteId, schema.clinicaPaciente.id))
    .innerJoin(schema.clinicaEspecialidad, eq(schema.clinicaCita.especialidadId, schema.clinicaEspecialidad.id))
    .innerJoin(schema.clinicaProfesional, eq(schema.clinicaCita.profesionalId, schema.clinicaProfesional.id))
    .leftJoin(schema.clinicaProcedimiento, eq(schema.clinicaCita.procedimientoId, schema.clinicaProcedimiento.id))
    .where(and(eq(schema.clinicaCita.organizationId, organizationId), eq(schema.clinicaCita.id, citaId)))
    .limit(1);
  if (!f) return;
  const { cita, paciente, proc } = f;
  const motivo = opts.motivo ?? "agendada";
  const servicio = proc ? proc.nombre : `Consulta de ${f.esp}`;
  const recomendaciones = proc
    ? [...((proc.recomendacion ?? "").split("\n").filter(Boolean)), TRAER_SIEMPRE]
    : RECOMENDACION_CONSULTA;
  // WhatsApp limita el texto de una imagen a 1024 caracteres: la tarjeta con el
  // logo lleva la cita, y las recomendaciones van en el mensaje siguiente.
  const tarjeta =
    `✅ *Cita ${motivo} — Clínica Oftalmológica Unidad Láser del Atlántico*\n\n` +
    `👤 ${`${paciente.nombres} ${paciente.apellidos ?? ""}`.trim()}\n📅 ${fechaLarga(cita.inicio)}\n🩺 ${servicio} con ${f.prof}`;
  const indicaciones =
    `*Recomendaciones antes de su cita:*\n${recomendaciones.map((r) => `• ${r}`).join("\n")}\n\n` +
    (proc?.pdf ? "Le enviamos también la guía de preparación en PDF.\n" : "") +
    `Si no puede asistir, respóndanos por aquí. Teléfono ${CONTACTO_CLINICA.telefono} · WhatsApp ${CONTACTO_CLINICA.whatsapp}.`;
  const texto = `${tarjeta}\n\n${indicaciones}`;

  const pdf = proc?.pdf ? await archivoPublico(`${CARPETA_RECOMENDACIONES}/${proc.pdf}`).catch(() => null) : null;
  const logo = await archivoPublico(LOGO_CLINICA).catch(() => null);
  const nombrePdf = `Recomendacion-${(proc?.nombre ?? "consulta").replace(/[^\p{L}\p{N}]+/gu, "-")}.pdf`;
  const resultado: Record<string, string> = {};

  // WhatsApp: la conversación de la cita o la última del paciente.
  let conversationId = opts.conversationId ?? cita.conversationId ?? null;
  if (!conversationId && paciente.contactId) {
    const [c] = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.organizationId, organizationId),
          eq(schema.conversation.contactId, paciente.contactId),
          eq(schema.conversation.isTest, false)
        )
      )
      .orderBy(desc(schema.conversation.lastMessageAt))
      .limit(1);
    conversationId = c?.id ?? null;
  }
  if (conversationId) {
    const { sendMediaMessage, sendText } = await import("@/server/inbox/send");
    try {
      if (logo) {
        await sendMediaMessage({
          conversationId,
          organizationId,
          file: { data: logo, mimeType: "image/jpeg", fileName: "unidad-laser.jpg" },
          caption: tarjeta,
        });
        await sendText({ conversationId, organizationId, text: indicaciones });
      } else {
        await sendText({ conversationId, organizationId, text: texto });
      }
      if (pdf) {
        await sendMediaMessage({
          conversationId,
          organizationId,
          file: { data: pdf, mimeType: "application/pdf", fileName: nombrePdf },
          caption: `Guía de preparación: ${proc?.nombre}`,
        });
      }
      resultado.whatsapp = new Date().toISOString();
    } catch (err) {
      resultado.whatsapp = `error: ${err instanceof Error ? err.message : "falló"}`;
    }
  }

  // Correo, desde el correo de la IA (o el del administrador).
  if (paciente.correo && !/@ejemplo\.com$/i.test(paciente.correo)) {
    const quien = await remitente(organizationId);
    if (quien) {
      try {
        const adjuntos = [
          ...(pdf ? [{ nombre: nombrePdf, contenido: pdf, tipo: "application/pdf" }] : []),
          ...(logo ? [{ nombre: "unidad-laser.jpg", contenido: logo, tipo: "image/jpeg" }] : []),
        ];
        await enviarCorreo(organizationId, quien.de, {
          para: paciente.correo,
          asunto: `Cita ${motivo}: ${servicio} — ${fechaLarga(cita.inicio)}`,
          texto: texto.replace(/\*/g, ""),
          adjuntos,
        });
        resultado.correo = new Date().toISOString();
      } catch (err) {
        resultado.correo = `error: ${err instanceof Error ? err.message : "falló"}`;
      }
    }
  }

  await db.update(schema.clinicaCita).set({ confirmacion: resultado }).where(eq(schema.clinicaCita.id, cita.id));
  const fallas = Object.entries(resultado).filter(([, v]) => v.startsWith("error"));
  if (conversationId) {
    await notaDelSistema(
      organizationId,
      conversationId,
      `📋 Confirmación de la cita con recomendaciones (${servicio})` +
        (resultado.whatsapp && !resultado.whatsapp.startsWith("error") ? " enviada por WhatsApp" : "") +
        (resultado.correo && !resultado.correo.startsWith("error") ? ` y al correo ${paciente.correo}` : "") +
        "." +
        (fallas.length ? ` Pendiente: ${fallas.map(([k, v]) => `${k} ${v.slice(7)}`).join(" · ")}.` : "")
    ).catch(() => {});
  }
}
