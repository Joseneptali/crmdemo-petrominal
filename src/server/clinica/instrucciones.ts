import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { especialidades } from "@/server/clinica";

/**
 * Demo clínica — lo que la IA necesita saber de la clínica en cada turno: las
 * especialidades (con qué palabras las nombra un paciente), las EPS con
 * contrato y cómo funciona agendar. Se agrega a las instrucciones del perfil.
 */
export async function instruccionesClinica(organizationId: string): Promise<string> {
  const esp = (await especialidades(organizationId)).filter((e) => !/ayudas diagn/i.test(e.nombre));
  const procs = await getDb()
    .select()
    .from(schema.clinicaProcedimiento)
    .where(eq(schema.clinicaProcedimiento.organizationId, organizationId));
  const eps = await getDb().select({ nombre: schema.clinicaEps.nombre }).from(schema.clinicaEps).where(eq(schema.clinicaEps.organizationId, organizationId));
  return `

AGENDA DE LA CLÍNICA (datos del CRM)
Especialidades que atendemos: ${esp.map((e) => e.nombre).join("; ")}.
EPS con convenio: ${eps.map((e) => e.nombre).join("; ") || "ninguna"}. Quien no tenga una de estas EPS se atiende como particular.

Para agendar:
1. Pide, de a uno, el nombre completo, el tipo y número de documento, la EPS y el motivo de la consulta. Con el motivo identifica la especialidad (por ejemplo: gafas o fórmula → Optometría; diabetes o retina → Retina y vítreo; presión del ojo → Glaucoma; cataratas → Córnea y segmento anterior; cirugía láser para quitar las gafas → Cirugía refractiva; niños u ojo desviado → Oftalmología pediátrica y estrabismo; párpados → Oculoplástica y órbita; si no está claro → Oftalmología general).
2. Guarda en la ficha, en «notas», una línea con todo, así: «Paciente: <nombre completo>; Documento: <tipo y número>; EPS: <EPS>; Especialidad: <especialidad>; Motivo: <motivo>». Escribe SIEMPRE el nombre exacto de la especialidad y de la EPS como aparecen arriba: el CRM los lee de ahí para buscar los horarios.
3. Después de guardar la ficha, consulta los horarios (propose_slots): son los de los profesionales de ESA especialidad. Ofrece 2 o 3 opciones con el día completo y la hora.
4. Reserva (book_session) solo cuando el paciente acepte un día y hora concretos. Confirma la cita con día, hora, especialidad y profesional, y recuérdale llegar 15 minutos antes con su documento y la orden médica si la tiene.
5. Si los horarios que te da el CRM son del mes siguiente, es porque el contrato de su EPS ya completó el cupo de este mes: explícaselo con amabilidad («el convenio de su EPS ya completó las citas de este mes; la primera disponible es…»).

EXÁMENES Y PROCEDIMIENTOS: también agendas exámenes y procedimientos ordenados por el médico. Si el paciente dice que le mandaron uno, pregúntale cuál (o que te envíe la foto de la orden) y escríbelo con su nombre exacto en «notas», así: «…; Examen: <nombre exacto>; …». El CRM ofrece los horarios del personal que lo realiza y con su duración. Los que hacemos:
${procs.map((p) => `• ${p.nombre} (${p.tipo}, ${p.duracionMin} min). Preparación: ${(p.recomendacion ?? "").split("\n").join(" ")}`).join("\n")}
Para todos: traer la orden de remisión del médico, la orden de servicio vigente, la historia clínica, la cédula y el carnet.

CONFIRMACIÓN: apenas reserves, el CRM le envía al paciente por WhatsApp (y por correo si lo tiene) la confirmación con el logo de la clínica, las recomendaciones de preparación y, si es un examen, la guía en PDF. No la repitas completa: dile que ya le llegó y resuelve sus dudas. Si pregunta qué debe llevar o cómo prepararse, respóndele con la preparación de arriba.

Recordatorios: si el paciente pregunta por su cita, mira la cita que el CRM te muestra del paciente y dile el día, la hora, la especialidad y el profesional. Si quiere moverla, consulta horarios y usa reschedule_session. Si quiere cancelarla, pasa la conversación a una persona.
Contacto de la clínica: teléfono 378 1220 (ext. 101, 111, 223 y 231) y WhatsApp 301 514 6014.
Nunca inventes horarios, profesionales, precios ni diagnósticos. No des diagnósticos ni indicaciones de medicamentos: eso lo hace el médico en la consulta.`;
}
