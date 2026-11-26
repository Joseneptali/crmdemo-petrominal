import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  DIAS_HORIZONTE,
  documentoEnTexto,
  fechaLarga,
  huecosLibres,
  mesDe,
  reconocerEspecialidad,
  sinTildes,
  ZONA_CLINICA,
  type Horario,
  type HuecoClinica,
} from "@/lib/clinica";
import { addDaysISO, dayIsoInTz } from "@/lib/time/slots";
import { correoEnTexto } from "@/server/cotizaciones";

/**
 * Demo clínica oftalmológica — el servicio: quién atiende qué, qué huecos hay
 * para una especialidad, el tope mensual de cada contrato y las citas.
 */

export class ClinicaError extends Error {
  constructor(
    public code: "not_found" | "invalid" | "slot_taken" | "slot_not_offered" | "tope",
    message: string
  ) {
    super(message);
  }
}

/** La clínica está activa en esta organización cuando tiene especialidades. */
export async function clinicaActiva(organizationId: string): Promise<boolean> {
  const [f] = await getDb()
    .select({ id: schema.clinicaEspecialidad.id })
    .from(schema.clinicaEspecialidad)
    .where(eq(schema.clinicaEspecialidad.organizationId, organizationId))
    .limit(1);
  return Boolean(f);
}

export async function especialidades(organizationId: string) {
  return getDb()
    .select()
    .from(schema.clinicaEspecialidad)
    .where(eq(schema.clinicaEspecialidad.organizationId, organizationId))
    .orderBy(asc(schema.clinicaEspecialidad.orden), asc(schema.clinicaEspecialidad.nombre));
}

/** Consumo del contrato por mes ("YYYY-MM" → pesos): suma de las citas no canceladas. */
export async function consumoPorMes(organizationId: string, contratoId: string): Promise<Record<string, number>> {
  const filas = await getDb()
    .select({
      mes: sql<string>`to_char(${schema.clinicaCita.inicio} at time zone 'UTC' at time zone 'America/Bogota', 'YYYY-MM')`,
      total: sql<string>`coalesce(sum(${schema.clinicaCita.valor}), 0)`,
    })
    .from(schema.clinicaCita)
    .where(
      scoped(
        schema.clinicaCita.organizationId,
        organizationId,
        eq(schema.clinicaCita.contratoId, contratoId),
        ne(schema.clinicaCita.estado, "cancelada")
      )
    )
    .groupBy(sql`1`);
  return Object.fromEntries(filas.map((f) => [f.mes, Number(f.total)]));
}

/** El contrato vigente de una EPS (el primero activo). */
async function contratoDeEps(organizationId: string, epsId: string | null) {
  if (!epsId) return null;
  const [c] = await getDb()
    .select()
    .from(schema.clinicaContrato)
    .where(
      scoped(
        schema.clinicaContrato.organizationId,
        organizationId,
        eq(schema.clinicaContrato.epsId, epsId),
        eq(schema.clinicaContrato.activo, true)
      )
    )
    .orderBy(desc(schema.clinicaContrato.createdAt))
    .limit(1);
  return c ?? null;
}

/**
 * El servicio que aplica: primera vez, o control si el paciente ya tuvo una
 * cita (no cancelada) de esa especialidad.
 */
async function servicioPara(
  organizationId: string,
  contratoId: string | null,
  especialidadId: string,
  pacienteId: string | null,
  procedimientoId: string | null = null
) {
  if (!contratoId) return null;
  const db = getDb();
  if (procedimientoId) {
    const [s] = await db
      .select()
      .from(schema.clinicaServicio)
      .where(
        scoped(
          schema.clinicaServicio.organizationId,
          organizationId,
          eq(schema.clinicaServicio.contratoId, contratoId),
          eq(schema.clinicaServicio.procedimientoId, procedimientoId)
        )
      )
      .limit(1);
    return s ?? null;
  }
  let tipo = "primera_vez";
  if (pacienteId) {
    const [previa] = await db
      .select({ id: schema.clinicaCita.id })
      .from(schema.clinicaCita)
      .where(
        scoped(
          schema.clinicaCita.organizationId,
          organizationId,
          eq(schema.clinicaCita.pacienteId, pacienteId),
          eq(schema.clinicaCita.especialidadId, especialidadId),
          isNull(schema.clinicaCita.procedimientoId),
          ne(schema.clinicaCita.estado, "cancelada")
        )
      )
      .limit(1);
    if (previa) tipo = "control";
  }
  const servicios = await db
    .select()
    .from(schema.clinicaServicio)
    .where(
      scoped(
        schema.clinicaServicio.organizationId,
        organizationId,
        eq(schema.clinicaServicio.contratoId, contratoId),
        eq(schema.clinicaServicio.especialidadId, especialidadId),
        isNull(schema.clinicaServicio.procedimientoId)
      )
    );
  return servicios.find((s) => s.tipo === tipo) ?? servicios[0] ?? null;
}

export async function procedimientoPorId(organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const [p] = await getDb()
    .select()
    .from(schema.clinicaProcedimiento)
    .where(scoped(schema.clinicaProcedimiento.organizationId, organizationId, eq(schema.clinicaProcedimiento.id, id)))
    .limit(1);
  return p ?? null;
}

/** Huecos de una especialidad para un paciente (con el tope de su contrato). */
export async function disponibilidad(
  organizationId: string,
  opts: {
    especialidadId: string;
    /** Examen o procedimiento: lo hacen sus profesionales (enfermería o médicos) y dura lo suyo. */
    procedimientoId?: string | null;
    pacienteId: string | null;
    epsId: string | null;
    now?: Date;
    fromISO?: string;
    toISO?: string;
    excluirCitaId?: string;
  }
): Promise<{ huecos: HuecoClinica[]; contratoId: string | null; servicioId: string | null; valor: number; topeLleno: boolean }> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const desde = opts.fromISO ?? dayIsoInTz(now, ZONA_CLINICA);
  const hasta = opts.toISO ?? addDaysISO(desde, DIAS_HORIZONTE);
  const proc = await procedimientoPorId(organizationId, opts.procedimientoId);
  const quienes = proc ? ((proc.profesionalIds as string[] | null) ?? []) : null;
  const profesionales = (
    await db
      .select()
      .from(schema.clinicaProfesional)
      .where(
        scoped(
          schema.clinicaProfesional.organizationId,
          organizationId,
          quienes
            ? inArray(schema.clinicaProfesional.id, quienes.length ? quienes : ["-"])
            : eq(schema.clinicaProfesional.especialidadId, opts.especialidadId),
          eq(schema.clinicaProfesional.activo, true)
        )
      )
  ).map((p) => (proc ? { ...p, duracionMin: proc.duracionMin } : p));
  if (profesionales.length === 0) return { huecos: [], contratoId: null, servicioId: null, valor: 0, topeLleno: false };

  const ocupadasFilas = await db
    .select({
      id: schema.clinicaCita.id,
      profesionalId: schema.clinicaCita.profesionalId,
      inicio: schema.clinicaCita.inicio,
      duracionMin: schema.clinicaCita.duracionMin,
    })
    .from(schema.clinicaCita)
    .where(
      scoped(
        schema.clinicaCita.organizationId,
        organizationId,
        inArray(
          schema.clinicaCita.profesionalId,
          profesionales.map((p) => p.id)
        ),
        ne(schema.clinicaCita.estado, "cancelada"),
        gte(schema.clinicaCita.inicio, new Date(`${desde}T00:00:00-05:00`))
      )
    );
  const ocupadas = ocupadasFilas
    .filter((o) => o.id !== opts.excluirCitaId)
    .map((o) => ({
      profesionalId: o.profesionalId,
      startUtc: o.inicio.toISOString(),
      endUtc: new Date(o.inicio.getTime() + o.duracionMin * 60_000).toISOString(),
    }));

  const contrato = await contratoDeEps(organizationId, opts.epsId);
  const servicio = await servicioPara(organizationId, contrato?.id ?? null, opts.especialidadId, opts.pacienteId, proc?.id ?? null);
  const valor = servicio?.valor ?? 0;
  let consumo: Record<string, number> = {};
  if (contrato && servicio) {
    consumo = await consumoPorMes(organizationId, contrato.id);
    // Al reprogramar, la cita misma no cuenta contra el tope.
    if (opts.excluirCitaId) {
      const [c] = await db.select().from(schema.clinicaCita).where(eq(schema.clinicaCita.id, opts.excluirCitaId)).limit(1);
      if (c && c.contratoId === contrato.id && c.estado !== "cancelada") {
        const m = mesDe(c.inicio);
        consumo[m] = Math.max(0, (consumo[m] ?? 0) - c.valor);
      }
    }
  }
  const huecos = huecosLibres({
    profesionales: profesionales.map((p) => ({ id: p.id, horario: p.horario as Horario, duracionMin: p.duracionMin })),
    ocupadas,
    fromISO: desde,
    toISO: hasta,
    now,
    tope: contrato && servicio ? { topeMensual: contrato.topeMensual, valor, consumoPorMes: consumo } : null,
  });
  const mesActual = mesDe(now);
  const topeLleno = Boolean(contrato && servicio && (consumo[mesActual] ?? 0) + valor > contrato.topeMensual);
  return { huecos, contratoId: contrato?.id ?? null, servicioId: servicio?.id ?? null, valor, topeLleno };
}

/** Crea la cita revisando que el profesional siga libre y que el contrato tenga cupo en ese mes. */
export async function agendar(
  organizationId: string,
  input: {
    pacienteId: string;
    especialidadId: string;
    procedimientoId?: string | null;
    startUtc: string;
    profesionalId?: string | null;
    origen: "manual" | "ia";
    conversationId?: string | null;
    notas?: string | null;
    now?: Date;
  }
) {
  const db = getDb();
  const [paciente] = await db
    .select()
    .from(schema.clinicaPaciente)
    .where(scoped(schema.clinicaPaciente.organizationId, organizationId, eq(schema.clinicaPaciente.id, input.pacienteId)))
    .limit(1);
  if (!paciente) throw new ClinicaError("not_found", "Paciente no encontrado");
  const proc = await procedimientoPorId(organizationId, input.procedimientoId);
  const especialidadId = proc?.especialidadId ?? input.especialidadId;
  const dia = dayIsoInTz(new Date(input.startUtc), ZONA_CLINICA);
  const disp = await disponibilidad(organizationId, {
    especialidadId,
    procedimientoId: proc?.id ?? null,
    pacienteId: paciente.id,
    epsId: paciente.epsId,
    now: input.now,
    fromISO: dia,
    toISO: dia,
  });
  const hueco = disp.huecos.find((h) => h.startUtc === new Date(input.startUtc).toISOString());
  if (!hueco) {
    if (disp.contratoId && disp.servicioId) {
      const consumo = await consumoPorMes(organizationId, disp.contratoId);
      const [ctr] = await db.select().from(schema.clinicaContrato).where(eq(schema.clinicaContrato.id, disp.contratoId)).limit(1);
      if (ctr && (consumo[mesDe(input.startUtc)] ?? 0) + disp.valor > ctr.topeMensual) {
        throw new ClinicaError("tope", "El contrato de la EPS ya llegó a su tope de este mes; agende en el mes siguiente");
      }
    }
    throw new ClinicaError("slot_taken", "Ese horario ya no está disponible");
  }
  const profesionalId =
    input.profesionalId && hueco.profesionalIds.includes(input.profesionalId) ? input.profesionalId : hueco.profesionalIds[0]!;
  const [prof] = await db.select().from(schema.clinicaProfesional).where(eq(schema.clinicaProfesional.id, profesionalId)).limit(1);
  try {
    const [cita] = await db
      .insert(schema.clinicaCita)
      .values({
        id: newId("clinicaCita"),
        organizationId,
        pacienteId: paciente.id,
        profesionalId,
        especialidadId,
        procedimientoId: proc?.id ?? null,
        servicioId: disp.servicioId,
        contratoId: disp.servicioId ? disp.contratoId : null,
        inicio: new Date(hueco.startUtc),
        duracionMin: proc?.duracionMin ?? prof?.duracionMin ?? 20,
        valor: disp.valor,
        estado: "agendada",
        origen: input.origen,
        conversationId: input.conversationId ?? null,
        notas: input.notas ?? null,
      })
      .returning();
    return cita!;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new ClinicaError("slot_taken", "Ese horario acaba de ocuparse");
    throw err;
  }
}

/** Mueve una cita agendada a otro hueco de su especialidad (con el tope del mes nuevo). */
export async function reprogramar(organizationId: string, citaId: string, startUtc: string, now?: Date) {
  const db = getDb();
  const [cita] = await db
    .select()
    .from(schema.clinicaCita)
    .where(scoped(schema.clinicaCita.organizationId, organizationId, eq(schema.clinicaCita.id, citaId)))
    .limit(1);
  if (!cita || cita.estado !== "agendada") throw new ClinicaError("not_found", "No hay una cita agendada para mover");
  const [paciente] = await db.select().from(schema.clinicaPaciente).where(eq(schema.clinicaPaciente.id, cita.pacienteId)).limit(1);
  const dia = dayIsoInTz(new Date(startUtc), ZONA_CLINICA);
  const disp = await disponibilidad(organizationId, {
    especialidadId: cita.especialidadId,
    procedimientoId: cita.procedimientoId,
    pacienteId: null,
    epsId: paciente?.epsId ?? null,
    now,
    fromISO: dia,
    toISO: dia,
    excluirCitaId: cita.id,
  });
  const hueco = disp.huecos.find((h) => h.startUtc === new Date(startUtc).toISOString());
  if (!hueco) throw new ClinicaError("slot_taken", "Ese horario ya no está disponible");
  const profesionalId = hueco.profesionalIds.includes(cita.profesionalId) ? cita.profesionalId : hueco.profesionalIds[0]!;
  const [movida] = await db
    .update(schema.clinicaCita)
    .set({ inicio: new Date(hueco.startUtc), profesionalId, recordatorios: null, updatedAt: new Date() })
    .where(eq(schema.clinicaCita.id, cita.id))
    .returning();
  return movida!;
}

/* ---------- Paciente y especialidad de una conversación ---------- */

const soloDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");
const ultimos10 = (t: string | null | undefined) => soloDigitos(t).slice(-10);

/** Los textos del paciente y la ficha, del más reciente al más antiguo. */
async function textosDeConversacion(organizationId: string, conversationId: string) {
  const db = getDb();
  const [conv] = await db
    .select({
      contactId: schema.conversation.contactId,
      isTest: schema.conversation.isTest,
      ficha: schema.contact.ficha,
      nombre: schema.contact.name,
      telefono: schema.contact.phone,
    })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.conversation.contactId, schema.contact.id))
    .where(and(eq(schema.conversation.organizationId, organizationId), eq(schema.conversation.id, conversationId)))
    .limit(1);
  if (!conv) return null;
  const mensajes = await db
    .select({ text: schema.message.text })
    .from(schema.message)
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        eq(schema.message.conversationId, conversationId),
        eq(schema.message.direction, "in")
      )
    )
    .orderBy(desc(schema.message.createdAt))
    .limit(30);
  const ficha = (conv.ficha ?? {}) as Record<string, unknown>;
  const textosFicha = Object.values(ficha).filter((v): v is string => typeof v === "string");
  return {
    contactId: conv.contactId,
    isTest: conv.isTest,
    nombre: conv.nombre,
    telefono: conv.telefono,
    // La ficha la escribe la IA con lo último que entendió: va primero.
    textos: [...textosFicha, ...mensajes.map((m) => m.text ?? "").filter(Boolean)],
  };
}

/**
 * Qué quiere agendar el paciente: un examen o procedimiento si lo nombra
 * («me mandaron una angiografía»), si no la especialidad que nombra; sin
 * ninguna, lo de su próxima cita (quien quiere moverla no la repite) y, por
 * último, oftalmología general.
 */
export async function queAgendar(organizationId: string, conversationId: string) {
  const db = getDb();
  const esp = await especialidades(organizationId);
  const procs = await db
    .select()
    .from(schema.clinicaProcedimiento)
    .where(eq(schema.clinicaProcedimiento.organizationId, organizationId));
  const datos = await textosDeConversacion(organizationId, conversationId);
  const textos = datos?.textos ?? [];
  const procId = reconocerEspecialidad(textos, procs);
  const proc = procs.find((p) => p.id === procId) ?? null;
  if (proc) return { especialidad: esp.find((e) => e.id === proc.especialidadId) ?? null, procedimiento: proc };
  let espId = reconocerEspecialidad(textos, esp);
  let procedimiento: (typeof procs)[number] | null = null;
  if (!espId && datos) {
    const prox = await proximaCitaDelContacto(organizationId, datos.contactId);
    espId = prox?.especialidadId ?? null;
    procedimiento = procs.find((p) => p.id === prox?.procedimientoId) ?? null;
  }
  const especialidad = esp.find((e) => e.id === espId) ?? esp.find((e) => /general/i.test(e.nombre)) ?? esp[0] ?? null;
  return { especialidad, procedimiento };
}

/** La especialidad que pide el paciente en esta conversación (defecto: oftalmología general). */
export async function especialidadDeConversacion(organizationId: string, conversationId: string) {
  return (await queAgendar(organizationId, conversationId)).especialidad;
}

/**
 * El paciente de la conversación: el ya vinculado al contacto, o el que tiene
 * su teléfono o su documento; si no existe, se crea con lo que el paciente
 * escribió (nombre, documento, EPS, correo). Lo que falte se completa luego.
 */
export async function pacienteDeConversacion(organizationId: string, conversationId: string) {
  const db = getDb();
  const datos = await textosDeConversacion(organizationId, conversationId);
  if (!datos) return null;
  const todo = datos.textos.join(" \n ");
  const documento = datos.textos.map(documentoEnTexto).find(Boolean) ?? null;
  const epsLista = await db.select().from(schema.clinicaEps).where(eq(schema.clinicaEps.organizationId, organizationId));
  const t = sinTildes(todo);
  const eps =
    epsLista.find((e) => t.includes(sinTildes(e.nombre))) ??
    epsLista.find((e) => t.includes(sinTildes(e.nombre.replace(/^eps\s+/i, "")))) ??
    null;

  const pacientes = await db.select().from(schema.clinicaPaciente).where(eq(schema.clinicaPaciente.organizationId, organizationId));
  let paciente =
    pacientes.find((p) => p.contactId === datos.contactId) ??
    (documento ? pacientes.find((p) => p.documento === documento) : undefined) ??
    (ultimos10(datos.telefono) ? pacientes.find((p) => ultimos10(p.telefono) === ultimos10(datos.telefono)) : undefined);

  if (paciente) {
    const cambios: Partial<typeof schema.clinicaPaciente.$inferInsert> = {};
    if (!paciente.contactId) cambios.contactId = datos.contactId;
    if (!paciente.documento && documento) cambios.documento = documento;
    if (!paciente.epsId && eps) cambios.epsId = eps.id;
    if (Object.keys(cambios).length > 0) {
      const [act] = await db
        .update(schema.clinicaPaciente)
        .set({ ...cambios, updatedAt: new Date() })
        .where(eq(schema.clinicaPaciente.id, paciente.id))
        .returning();
      paciente = act ?? paciente;
    }
    return paciente;
  }

  // Una conversación del Laboratorio no crea pacientes de verdad.
  if (datos.isTest) return null;
  const [nombres, ...resto] = (datos.nombre ?? "Paciente").trim().split(/\s+/);
  const [nuevo] = await db
    .insert(schema.clinicaPaciente)
    .values({
      id: newId("clinicaPaciente"),
      organizationId,
      contactId: datos.contactId,
      documento,
      nombres: nombres || "Paciente",
      apellidos: resto.join(" ") || null,
      telefono: datos.telefono,
      correo: correoEnTexto(datos.textos),
      epsId: eps?.id ?? null,
    })
    .returning();
  return nuevo!;
}

/* ---------- Citas en el contexto de la IA ---------- */

export async function etiquetaDeCita(organizationId: string, citaId: string): Promise<string> {
  const db = getDb();
  const [f] = await db
    .select({ inicio: schema.clinicaCita.inicio, esp: sql<string>`coalesce(${schema.clinicaProcedimiento.nombre}, ${schema.clinicaEspecialidad.nombre})`, prof: schema.clinicaProfesional.nombre })
    .from(schema.clinicaCita)
    .innerJoin(schema.clinicaEspecialidad, eq(schema.clinicaCita.especialidadId, schema.clinicaEspecialidad.id))
    .leftJoin(schema.clinicaProcedimiento, eq(schema.clinicaCita.procedimientoId, schema.clinicaProcedimiento.id))
    .innerJoin(schema.clinicaProfesional, eq(schema.clinicaCita.profesionalId, schema.clinicaProfesional.id))
    .where(and(eq(schema.clinicaCita.organizationId, organizationId), eq(schema.clinicaCita.id, citaId)))
    .limit(1);
  return f ? `${fechaLarga(f.inicio)} — ${f.esp} con ${f.prof}` : "";
}

/**
 * Las citas del paciente de este contacto, con la forma que el cerebro ya
 * sabe leer (`booking`: next / unresolved / lastClosed).
 */
export async function citasParaContexto(organizationId: string, contactId: string, now = new Date()) {
  const db = getDb();
  const [p] = await db
    .select({ id: schema.clinicaPaciente.id })
    .from(schema.clinicaPaciente)
    .where(scoped(schema.clinicaPaciente.organizationId, organizationId, eq(schema.clinicaPaciente.contactId, contactId)))
    .limit(1);
  if (!p) return { timezone: ZONA_CLINICA, next: null, unresolved: null, lastClosed: null };
  const filas = await db
    .select({
      id: schema.clinicaCita.id,
      inicio: schema.clinicaCita.inicio,
      duracionMin: schema.clinicaCita.duracionMin,
      estado: schema.clinicaCita.estado,
      updatedAt: schema.clinicaCita.updatedAt,
      esp: sql<string>`coalesce(${schema.clinicaProcedimiento.nombre}, ${schema.clinicaEspecialidad.nombre})`,
      prof: schema.clinicaProfesional.nombre,
    })
    .from(schema.clinicaCita)
    .innerJoin(schema.clinicaEspecialidad, eq(schema.clinicaCita.especialidadId, schema.clinicaEspecialidad.id))
    .leftJoin(schema.clinicaProcedimiento, eq(schema.clinicaCita.procedimientoId, schema.clinicaProcedimiento.id))
    .innerJoin(schema.clinicaProfesional, eq(schema.clinicaCita.profesionalId, schema.clinicaProfesional.id))
    .where(
      and(
        eq(schema.clinicaCita.organizationId, organizationId),
        eq(schema.clinicaCita.pacienteId, p.id),
        gte(schema.clinicaCita.inicio, new Date(now.getTime() - 7 * 86_400_000))
      )
    )
    .orderBy(asc(schema.clinicaCita.inicio));
  const forma = (f: (typeof filas)[number]) => ({
    id: f.id,
    startUtc: f.inicio.toISOString(),
    endUtc: new Date(f.inicio.getTime() + f.duracionMin * 60_000).toISOString(),
    label: `${fechaLarga(f.inicio)} — ${f.esp} con ${f.prof}`,
    meetingLink: null,
    linkPending: false,
  });
  const futura = filas.find((f) => f.estado === "agendada" && f.inicio.getTime() > now.getTime());
  const sinCerrar = [...filas].reverse().find((f) => f.estado === "agendada" && f.inicio.getTime() <= now.getTime());
  const cerrada = [...filas]
    .filter((f) => f.estado !== "agendada")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  return {
    timezone: ZONA_CLINICA,
    next: futura ? { ...forma(futura), status: "agendada" as const } : null,
    unresolved: sinCerrar ? { ...forma(sinCerrar), status: "agendada" as const } : null,
    lastClosed: cerrada
      ? {
          id: cerrada.id,
          status: (cerrada.estado === "atendida" ? "realizada" : cerrada.estado === "no_asistio" ? "no_show" : "cancelada") as
            | "realizada"
            | "no_show"
            | "cancelada",
          startUtc: cerrada.inicio.toISOString(),
          endUtc: new Date(cerrada.inicio.getTime() + cerrada.duracionMin * 60_000).toISOString(),
          label: `${fechaLarga(cerrada.inicio)} — ${cerrada.esp} con ${cerrada.prof}`,
          closedAt: cerrada.updatedAt.toISOString(),
          cancelledBy: cerrada.estado === "cancelada" ? ("equipo" as const) : null,
        }
      : null,
  };
}

/** La próxima cita agendada del paciente del contacto (la que mueve la IA). */
export async function proximaCitaDelContacto(organizationId: string, contactId: string, now = new Date()) {
  const db = getDb();
  const [f] = await db
    .select({ cita: schema.clinicaCita })
    .from(schema.clinicaCita)
    .innerJoin(schema.clinicaPaciente, eq(schema.clinicaCita.pacienteId, schema.clinicaPaciente.id))
    .where(
      and(
        eq(schema.clinicaCita.organizationId, organizationId),
        eq(schema.clinicaPaciente.contactId, contactId),
        eq(schema.clinicaCita.estado, "agendada"),
        gte(schema.clinicaCita.inicio, now)
      )
    )
    .orderBy(asc(schema.clinicaCita.inicio))
    .limit(1);
  return f?.cita ?? null;
}

/** Rango [desde, hasta) de un mes "YYYY-MM" en hora de Colombia. */
export function rangoDeMes(mes: string): { desde: Date; hasta: Date } {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const sig = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { desde: new Date(`${mes}-01T00:00:00-05:00`), hasta: new Date(`${sig}-01T00:00:00-05:00`) };
}

