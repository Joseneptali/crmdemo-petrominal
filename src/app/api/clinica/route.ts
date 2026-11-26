import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { veTodo } from "@/lib/asesores";
import { mesDe, ZONA_CLINICA } from "@/lib/clinica";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { dayIsoInTz } from "@/lib/time/slots";
import { agendar, ClinicaError, consumoPorMes, rangoDeMes, reprogramar } from "@/server/clinica";
import { enviarConfirmacionCita } from "@/server/clinica/confirmacion";
import { cargarDemoClinica, cargarProcedimientos } from "@/server/clinica/semilla";

export const dynamic = "force-dynamic";

/**
 * Demo clínica oftalmológica — todo lo que la pantalla «Clínica» necesita en
 * una sola lectura (los datos de la demo son pocos), y sus acciones.
 * GET ?mes=YYYY-MM → especialidades, profesionales, EPS, contratos con su
 * consumo del mes, pacientes y las citas del mes.
 */
export const GET = withAuth(async (session, req: Request) => {
  const org = session.organizationId;
  const db = getDb();
  const mes = new URL(req.url).searchParams.get("mes") ?? mesDe(new Date());
  if (!/^\d{4}-\d{2}$/.test(mes)) return apiError(422, "invalid_body", "mes debe ser YYYY-MM");
  const { desde, hasta } = rangoDeMes(mes);

  const procedimientos = await db
    .select()
    .from(schema.clinicaProcedimiento)
    .where(eq(schema.clinicaProcedimiento.organizationId, org))
    .orderBy(asc(schema.clinicaProcedimiento.orden));
  const [especialidades, profesionales, eps, contratos, servicios, pacientes, citas] = await Promise.all([
    db.select().from(schema.clinicaEspecialidad).where(eq(schema.clinicaEspecialidad.organizationId, org)).orderBy(asc(schema.clinicaEspecialidad.orden)),
    db.select().from(schema.clinicaProfesional).where(eq(schema.clinicaProfesional.organizationId, org)).orderBy(asc(schema.clinicaProfesional.nombre)),
    db.select().from(schema.clinicaEps).where(eq(schema.clinicaEps.organizationId, org)).orderBy(asc(schema.clinicaEps.nombre)),
    db.select().from(schema.clinicaContrato).where(eq(schema.clinicaContrato.organizationId, org)).orderBy(asc(schema.clinicaContrato.numero)),
    db.select().from(schema.clinicaServicio).where(eq(schema.clinicaServicio.organizationId, org)).orderBy(asc(schema.clinicaServicio.nombre)),
    db.select().from(schema.clinicaPaciente).where(eq(schema.clinicaPaciente.organizationId, org)).orderBy(asc(schema.clinicaPaciente.nombres)),
    db
      .select()
      .from(schema.clinicaCita)
      .where(scoped(schema.clinicaCita.organizationId, org, and(gte(schema.clinicaCita.inicio, desde), lt(schema.clinicaCita.inicio, hasta))))
      .orderBy(asc(schema.clinicaCita.inicio)),
  ]);
  const consumos = await Promise.all(contratos.map((c) => consumoPorMes(org, c.id)));
  const proximas = await db
    .select({ pacienteId: schema.clinicaCita.pacienteId, inicio: schema.clinicaCita.inicio })
    .from(schema.clinicaCita)
    .where(scoped(schema.clinicaCita.organizationId, org, eq(schema.clinicaCita.estado, "agendada"), gte(schema.clinicaCita.inicio, new Date())))
    .orderBy(asc(schema.clinicaCita.inicio));
  const proximaDe = new Map<string, string>();
  for (const p of proximas) if (!proximaDe.has(p.pacienteId)) proximaDe.set(p.pacienteId, p.inicio.toISOString());
  const ultimas = await db
    .select({ pacienteId: schema.clinicaCita.pacienteId, inicio: schema.clinicaCita.inicio })
    .from(schema.clinicaCita)
    .where(scoped(schema.clinicaCita.organizationId, org, eq(schema.clinicaCita.estado, "atendida")))
    .orderBy(desc(schema.clinicaCita.inicio));
  const ultimaDe = new Map<string, string>();
  for (const u of ultimas) if (!ultimaDe.has(u.pacienteId)) ultimaDe.set(u.pacienteId, u.inicio.toISOString());

  return Response.json({
    mes,
    hoy: dayIsoInTz(new Date(), ZONA_CLINICA),
    puedeConfigurar: veTodo(session.role),
    especialidades,
    procedimientos,
    profesionales,
    eps,
    contratos: contratos.map((c, i) => ({
      ...c,
      consumoMes: consumos[i]?.[mes] ?? 0,
      servicios: servicios.filter((s) => s.contratoId === c.id),
    })),
    pacientes: pacientes.map((p) => ({ ...p, proximaCita: proximaDe.get(p.id) ?? null, ultimaAtencion: ultimaDe.get(p.id) ?? null })),
    citas: citas.map((c) => ({ ...c, inicio: c.inicio.toISOString() })),
  });
});

const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("cargarDemo") }),
  z.object({ accion: z.literal("crearEps"), nombre: z.string().trim().min(2).max(120), nit: z.string().trim().max(40).optional() }),
  z.object({
    accion: z.literal("crearContrato"),
    epsId: z.string().min(1),
    numero: z.string().trim().min(1).max(60),
    topeMensual: z.number().int().positive(),
    inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({
    accion: z.literal("editarContrato"),
    id: z.string().min(1),
    numero: z.string().trim().min(1).max(60).optional(),
    topeMensual: z.number().int().positive().optional(),
    activo: z.boolean().optional(),
  }),
  z.object({
    accion: z.literal("crearServicio"),
    contratoId: z.string().min(1),
    especialidadId: z.string().min(1),
    nombre: z.string().trim().min(2).max(200),
    codigo: z.string().trim().max(20).optional(),
    tipo: z.enum(["primera_vez", "control"]),
    valor: z.number().int().nonnegative(),
  }),
  z.object({ accion: z.literal("editarServicio"), id: z.string().min(1), valor: z.number().int().nonnegative() }),
  z.object({
    accion: z.literal("crearPaciente"),
    tipoDocumento: z.string().trim().max(5),
    documento: z.string().trim().min(4).max(20),
    nombres: z.string().trim().min(1).max(80),
    apellidos: z.string().trim().max(80).optional(),
    fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    telefono: z.string().trim().max(20).optional(),
    correo: z.string().trim().max(120).optional(),
    epsId: z.string().nullable().optional(),
  }),
  z.object({
    accion: z.literal("crearCita"),
    pacienteId: z.string().min(1),
    especialidadId: z.string().min(1),
    procedimientoId: z.string().nullable().optional(),
    startUtc: z.string().min(1),
    profesionalId: z.string().nullable().optional(),
    notas: z.string().max(500).optional(),
  }),
  z.object({ accion: z.literal("estadoCita"), id: z.string().min(1), estado: z.enum(["agendada", "atendida", "no_asistio", "cancelada"]) }),
  z.object({ accion: z.literal("moverCita"), id: z.string().min(1), startUtc: z.string().min(1) }),
]);

const SOLO_ADMIN = new Set(["cargarDemo", "crearEps", "crearContrato", "editarContrato", "crearServicio", "editarServicio"]);

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, accion);
  if (!body.ok) return body.response;
  const d = body.data;
  const org = session.organizationId;
  if (SOLO_ADMIN.has(d.accion) && !veTodo(session.role)) {
    return apiError(403, "forbidden", "Solo la administración configura contratos y tarifas");
  }
  const db = getDb();
  try {
    switch (d.accion) {
      case "cargarDemo": {
        const r = await cargarDemoClinica(org);
        const p = await cargarProcedimientos(org);
        return Response.json({ ...r, procedimientos: p });
      }
      case "crearEps": {
        const [e] = await db.insert(schema.clinicaEps).values({ id: newId("clinicaEps"), organizationId: org, nombre: d.nombre, nit: d.nit ?? null }).returning();
        return Response.json({ eps: e });
      }
      case "crearContrato": {
        const [c] = await db
          .insert(schema.clinicaContrato)
          .values({ id: newId("clinicaContrato"), organizationId: org, epsId: d.epsId, numero: d.numero, topeMensual: d.topeMensual, inicio: d.inicio, fin: d.fin })
          .returning();
        return Response.json({ contrato: c });
      }
      case "editarContrato": {
        const { id, accion: _a, ...cambios } = d;
        void _a;
        const [c] = await db
          .update(schema.clinicaContrato)
          .set({ ...cambios, updatedAt: new Date() })
          .where(scoped(schema.clinicaContrato.organizationId, org, eq(schema.clinicaContrato.id, id)))
          .returning();
        return c ? Response.json({ contrato: c }) : apiError(404, "not_found", "Contrato no encontrado");
      }
      case "crearServicio": {
        const [s] = await db
          .insert(schema.clinicaServicio)
          .values({ id: newId("clinicaServicio"), organizationId: org, contratoId: d.contratoId, especialidadId: d.especialidadId, nombre: d.nombre, codigo: d.codigo ?? null, tipo: d.tipo, valor: d.valor })
          .returning();
        return Response.json({ servicio: s });
      }
      case "editarServicio": {
        const [s] = await db
          .update(schema.clinicaServicio)
          .set({ valor: d.valor, updatedAt: new Date() })
          .where(scoped(schema.clinicaServicio.organizationId, org, eq(schema.clinicaServicio.id, d.id)))
          .returning();
        return s ? Response.json({ servicio: s }) : apiError(404, "not_found", "Servicio no encontrado");
      }
      case "crearPaciente": {
        const [p] = await db
          .insert(schema.clinicaPaciente)
          .values({
            id: newId("clinicaPaciente"),
            organizationId: org,
            tipoDocumento: d.tipoDocumento || "CC",
            documento: d.documento,
            nombres: d.nombres,
            apellidos: d.apellidos || null,
            fechaNacimiento: d.fechaNacimiento || null,
            telefono: d.telefono || null,
            correo: d.correo || null,
            epsId: d.epsId || null,
          })
          .returning();
        return Response.json({ paciente: p });
      }
      case "crearCita": {
        const cita = await agendar(org, {
          pacienteId: d.pacienteId,
          especialidadId: d.especialidadId,
          procedimientoId: d.procedimientoId ?? null,
          startUtc: d.startUtc,
          profesionalId: d.profesionalId ?? null,
          origen: "manual",
          notas: d.notas ?? null,
        });
        void enviarConfirmacionCita(org, cita.id).catch((err) => console.error("[clinica] confirmación falló:", err));
        return Response.json({ cita });
      }
      case "estadoCita": {
        const [c] = await db
          .update(schema.clinicaCita)
          .set({ estado: d.estado, updatedAt: new Date() })
          .where(scoped(schema.clinicaCita.organizationId, org, eq(schema.clinicaCita.id, d.id)))
          .returning();
        return c ? Response.json({ cita: c }) : apiError(404, "not_found", "Cita no encontrada");
      }
      case "moverCita": {
        const cita = await reprogramar(org, d.id, d.startUtc);
        void enviarConfirmacionCita(org, cita.id, { motivo: "reprogramada" }).catch(() => {});
        return Response.json({ cita });
      }
    }
  } catch (err) {
    if (err instanceof ClinicaError) {
      return apiError(err.code === "not_found" ? 404 : 409, err.code, err.message);
    }
    throw err;
  }
});
