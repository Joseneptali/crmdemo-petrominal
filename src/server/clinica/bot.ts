import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { DIAS_HORIZONTE, mesDe, ZONA_CLINICA, type HuecoClinica } from "@/lib/clinica";
import { dayIsoInTz } from "@/lib/time/slots";
import { armarHuecos, daysWithAgenda } from "@/server/agenda/spread";
import {
  agendar,
  ClinicaError,
  disponibilidad,
  especialidadDeConversacion,
  etiquetaDeCita,
  pacienteDeConversacion,
  proximaCitaDelContacto,
  reprogramar,
} from "@/server/clinica";

/**
 * Demo clínica — lo que la IA usa por `/api/bot/availability` y
 * `/api/bot/bookings` cuando la clínica está activa. Misma forma de respuesta
 * que la agenda normal: el cerebro (Nea) no nota la diferencia, pero los
 * horarios salen de los profesionales de la especialidad que pidió el paciente
 * y respetan el tope mensual del contrato de su EPS.
 */

type Opciones = { date: string | null; limit: number; perDay: number; days: number };

export async function ofrecerHorarios(organizationId: string, conversationId: string, o: Opciones, now = new Date()) {
  const esp = await especialidadDeConversacion(organizationId, conversationId);
  if (!esp) return { slots: [], diasConAgenda: [], query: null, especialidad: null };
  const paciente = await pacienteDeConversacion(organizationId, conversationId);
  const disp = await disponibilidad(organizationId, {
    especialidadId: esp.id,
    pacienteId: paciente?.id ?? null,
    epsId: paciente?.epsId ?? null,
    now,
  });
  const hoy = dayIsoInTz(now, ZONA_CLINICA);
  // Si este mes ya no hay cupo, el reparto arranca donde empiezan los huecos.
  let days = o.days;
  const primero = disp.huecos[0];
  if (primero) {
    const dif = Math.round((Date.parse(dayIsoInTz(new Date(primero.startUtc), ZONA_CLINICA)) - Date.parse(hoy)) / 86_400_000);
    if (dif >= days) days = dif + o.days;
  }
  const { slots, query } = armarHuecos({
    todos: disp.huecos,
    timezone: ZONA_CLINICA,
    now,
    maxDaysAhead: DIAS_HORIZONTE,
    limit: o.limit,
    perDay: o.perDay,
    days,
    date: o.date,
    candidatosDelDia: o.date ? disp.huecos.filter((h) => dayIsoInTz(new Date(h.startUtc), ZONA_CLINICA) === o.date).length : 0,
  });

  // La oferta vigente: solo estos instantes se pueden reservar.
  const porInicio = new Map(disp.huecos.map((h) => [h.startUtc, h]));
  if (!o.date || slots.length > 0) {
    const ofrecidos = slots.map((s) => ({ startUtc: s.startUtc, profesionalIds: porInicio.get(s.startUtc)?.profesionalIds ?? [] }));
    await getDb()
      .insert(schema.clinicaOferta)
      .values({ conversationId, organizationId, especialidadId: esp.id, slots: ofrecidos })
      .onConflictDoUpdate({
        target: schema.clinicaOferta.conversationId,
        set: { especialidadId: esp.id, slots: ofrecidos, updatedAt: new Date() },
      });
  }

  const avisos: string[] = [`Horarios de ${esp.nombre}.`];
  if (disp.topeLleno) {
    avisos.push(
      `El contrato de la EPS del paciente ya completó su cupo de ${mesDe(now)}: estos horarios son del mes siguiente. Explícaselo con amabilidad.`
    );
  }
  if (paciente && !paciente.epsId) avisos.push("Aún no sabemos la EPS del paciente: pregúntasela antes de reservar.");
  return {
    slots: slots.map((s) => ({
      startUtc: s.startUtc,
      endUtc: s.endUtc,
      label: s.label,
      dayIso: s.dayIso,
      dayLabel: s.dayLabel,
      time: s.time,
    })),
    diasConAgenda: daysWithAgenda(slots),
    query,
    especialidad: esp.nombre,
    aviso: avisos.join(" "),
  };
}

async function oferta(conversationId: string) {
  const [o] = await getDb().select().from(schema.clinicaOferta).where(eq(schema.clinicaOferta.conversationId, conversationId)).limit(1);
  return o ?? null;
}

async function reofrecer(organizationId: string, conversationId: string) {
  const r = await ofrecerHorarios(organizationId, conversationId, { date: null, limit: 12, perDay: 3, days: 5 });
  return r.slots;
}

function error(code: string, message: string, slots: unknown[], status = 409) {
  return Response.json({ error: { code, message }, slots }, { status });
}

/** POST /api/bot/bookings con la clínica: reserva uno de los horarios ofrecidos. */
export async function reservarHorario(organizationId: string, conversationId: string, startUtc: string) {
  const inst = new Date(startUtc);
  if (Number.isNaN(inst.getTime())) return error("invalid_body", "Instante inválido", [], 422);
  const of = await oferta(conversationId);
  const ofrecido = (of?.slots as { startUtc: string; profesionalIds: string[] }[] | undefined)?.find(
    (s) => s.startUtc === inst.toISOString()
  );
  if (!of || !ofrecido) {
    return error("slot_not_offered", "Ese horario no se le ofreció: consulta los horarios primero", await reofrecer(organizationId, conversationId));
  }
  const paciente = await pacienteDeConversacion(organizationId, conversationId);
  if (!paciente) return error("not_found", "Conversación no encontrada", [], 404);
  try {
    const cita = await agendar(organizationId, {
      pacienteId: paciente.id,
      especialidadId: of.especialidadId,
      startUtc: inst.toISOString(),
      profesionalId: ofrecido.profesionalIds[0] ?? null,
      origen: "ia",
      conversationId,
    });
    await getDb().delete(schema.clinicaOferta).where(eq(schema.clinicaOferta.conversationId, conversationId));
    return Response.json(
      { bookingId: cita.id, meetingLink: null, linkPending: false, label: await etiquetaDeCita(organizationId, cita.id) },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ClinicaError) return error("slot_taken", err.message, await reofrecer(organizationId, conversationId));
    throw err;
  }
}

/** PATCH /api/bot/bookings con la clínica: mueve la próxima cita del paciente. */
export async function moverCita(organizationId: string, conversationId: string, contactId: string, startUtc: string) {
  const inst = new Date(startUtc);
  if (Number.isNaN(inst.getTime())) return error("invalid_body", "Instante inválido", [], 422);
  const cita = await proximaCitaDelContacto(organizationId, contactId);
  if (!cita) return error("not_found", "El paciente no tiene una cita agendada para mover", [], 404);
  const of = await oferta(conversationId);
  const ofrecido = (of?.slots as HuecoClinica[] | undefined)?.find((s) => s.startUtc === inst.toISOString());
  if (!ofrecido) {
    return error("slot_not_offered", "Ese horario no se le ofreció: consulta los horarios primero", await reofrecer(organizationId, conversationId));
  }
  try {
    const movida = await reprogramar(organizationId, cita.id, inst.toISOString());
    return Response.json({ bookingId: movida.id, meetingLink: null, linkPending: false, label: await etiquetaDeCita(organizationId, movida.id) });
  } catch (err) {
    if (err instanceof ClinicaError) return error("slot_taken", err.message, await reofrecer(organizationId, conversationId));
    throw err;
  }
}
