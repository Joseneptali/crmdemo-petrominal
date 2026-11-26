import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fechaLarga } from "@/lib/clinica";
import { notaDelSistema } from "@/server/asesores";

/**
 * Demo clínica — recordatorios de cita por WhatsApp, 24 h y 1 h antes, a los
 * pacientes que escriben por WhatsApp (tienen contacto y conversación). Los
 * pacientes de prueba sin WhatsApp no reciben nada. Fuera de la ventana de 24 h
 * de WhatsApp el envío falla (haría falta una plantilla aprobada por Meta) y
 * queda una nota interna en el chat.
 */

const RECORDATORIOS = [
  { clave: "24h", antesMs: 24 * 3_600_000, cuando: "mañana" },
  { clave: "1h", antesMs: 3_600_000, cuando: "en una hora" },
] as const;

let temporizador: ReturnType<typeof setInterval> | null = null;
let corriendo = false;

export async function pasadaRecordatoriosClinica(ahora = new Date()): Promise<number> {
  if (corriendo) return 0;
  corriendo = true;
  let enviados = 0;
  try {
    const db = getDb();
    const proximas = await db
      .select({
        cita: schema.clinicaCita,
        contactId: schema.clinicaPaciente.contactId,
        nombre: schema.clinicaPaciente.nombres,
        esp: schema.clinicaEspecialidad.nombre,
        prof: schema.clinicaProfesional.nombre,
      })
      .from(schema.clinicaCita)
      .innerJoin(schema.clinicaPaciente, eq(schema.clinicaCita.pacienteId, schema.clinicaPaciente.id))
      .innerJoin(schema.clinicaEspecialidad, eq(schema.clinicaCita.especialidadId, schema.clinicaEspecialidad.id))
      .innerJoin(schema.clinicaProfesional, eq(schema.clinicaCita.profesionalId, schema.clinicaProfesional.id))
      .where(
        and(
          eq(schema.clinicaCita.estado, "agendada"),
          gte(schema.clinicaCita.inicio, ahora),
          lte(schema.clinicaCita.inicio, new Date(ahora.getTime() + RECORDATORIOS[0].antesMs))
        )
      )
      .orderBy(asc(schema.clinicaCita.inicio))
      .limit(200);

    for (const { cita, contactId, nombre, esp, prof } of proximas) {
      const hechos: Record<string, string> = { ...((cita.recordatorios as Record<string, string> | null) ?? {}) };
      const pendientes = RECORDATORIOS.filter((x) => !hechos[x.clave] && ahora.getTime() >= cita.inicio.getTime() - x.antesMs);
      if (pendientes.length === 0) continue;
      const toca = pendientes[pendientes.length - 1]!;
      for (const x of pendientes) hechos[x.clave] = "omitido";
      // Una cita agendada con menos anticipación que el recordatorio no lo necesita.
      if (contactId && cita.inicio.getTime() - cita.createdAt.getTime() > toca.antesMs) {
        const [conv] = await db
          .select({ id: schema.conversation.id })
          .from(schema.conversation)
          .where(
            and(
              eq(schema.conversation.organizationId, cita.organizationId),
              eq(schema.conversation.contactId, contactId),
              eq(schema.conversation.isTest, false)
            )
          )
          .orderBy(desc(schema.conversation.lastMessageAt))
          .limit(1);
        if (conv) {
          const texto =
            `👁️ Hola ${nombre}, le recordamos su cita ${toca.cuando} en la Clínica Oftalmológica Unidad Láser del Atlántico:\n\n` +
            `📅 ${fechaLarga(cita.inicio)}\n🩺 ${esp} con ${prof}\n\n` +
            `Llegue 15 minutos antes con su documento de identidad y su orden. Si no puede asistir, respóndanos por aquí para reprogramarla.`;
          try {
            const { sendText } = await import("@/server/inbox/send");
            await sendText({ conversationId: conv.id, organizationId: cita.organizationId, text: texto });
            hechos[toca.clave] = new Date().toISOString();
            enviados++;
          } catch (err) {
            const e = err as { code?: string; message?: string };
            await notaDelSistema(
              cita.organizationId,
              conv.id,
              `⏰ No se pudo enviar el recordatorio de la cita (${toca.cuando}): ` +
                (e.code === "window_closed"
                  ? "pasaron más de 24 h desde el último mensaje del paciente (WhatsApp exige una plantilla aprobada)."
                  : (e.message ?? "falló"))
            ).catch(() => {});
          }
        }
      }
      await db.update(schema.clinicaCita).set({ recordatorios: hechos }).where(eq(schema.clinicaCita.id, cita.id));
    }
  } catch (err) {
    console.error("[clinica] pasada de recordatorios falló:", err);
  } finally {
    corriendo = false;
  }
  return enviados;
}

export function iniciarRecordatoriosClinica(): void {
  if (temporizador) return;
  temporizador = setInterval(() => void pasadaRecordatoriosClinica(), 60_000);
  temporizador.unref?.();
}
