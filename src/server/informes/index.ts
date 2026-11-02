import { and, asc, count, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { listarMiembros } from "@/server/asesores";
import type { Informe } from "@/lib/informes";

/**
 * Petrominal — informes gerenciales para la administración: estado de los
 * leads, desempeño por asesor, cotizaciones y reuniones en un periodo.
 */

export type { Informe };

const dia = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);

export async function generarInforme(
  organizationId: string,
  desde: Date,
  hasta: Date,
  /** Petrominal: con asesor, el informe es solo de sus clientes y sus ventas. */
  asesor?: string
): Promise<Informe> {
  const db = getDb();
  const deMisClientes = asesor ? eq(schema.contact.asesorUserId, asesor) : undefined;
  const enRango = (col: typeof schema.contact.createdAt) => and(gte(col, desde), lt(col, hasta));

  const [clientesNuevos] = await db
    .select({ n: count() })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, enRango(schema.contact.createdAt), deMisClientes));
  const [conversacionesNuevas] = await db
    .select({ n: count() })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.conversation.contactId, schema.contact.id))
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.isTest, false),
        and(gte(schema.conversation.createdAt, desde), lt(schema.conversation.createdAt, hasta)),
        deMisClientes
      )
    );
  const [sinAsesor] = await db
    .select({ n: count() })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, sql`${schema.contact.asesorUserId} is null`));

  const cotizaciones = await db
    .select()
    .from(schema.cotizacion)
    .where(
      scoped(
        schema.cotizacion.organizationId,
        organizationId,
        and(gte(schema.cotizacion.createdAt, desde), lt(schema.cotizacion.createdAt, hasta)),
        asesor ? eq(schema.cotizacion.asesorUserId, asesor) : undefined
      )
    );
  const reuniones = await db
    .select()
    .from(schema.reunion)
    .where(
      scoped(
        schema.reunion.organizationId,
        organizationId,
        and(gte(schema.reunion.inicio, desde), lt(schema.reunion.inicio, hasta)),
        asesor ? eq(schema.reunion.asesorUserId, asesor) : undefined
      )
    );

  const etapas = await db
    .select({ etapa: schema.pipelineStage.name, tipo: schema.pipelineStage.kind, leads: count(schema.lead.id) })
    .from(schema.pipelineStage)
    .leftJoin(
      schema.lead,
      and(
        eq(schema.lead.stageId, schema.pipelineStage.id),
        asesor
          ? sql`${schema.lead.contactId} in (select id from contact where asesor_user_id = ${asesor})`
          : undefined
      )
    )
    .where(scoped(schema.pipelineStage.organizationId, organizationId))
    .groupBy(schema.pipelineStage.id, schema.pipelineStage.name, schema.pipelineStage.kind, schema.pipelineStage.position)
    .orderBy(asc(schema.pipelineStage.position));

  const clientesPorAsesor = await db
    .select({ asesor: schema.contact.asesorUserId, n: count() })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId))
    .groupBy(schema.contact.asesorUserId);
  const mapaClientes = new Map(clientesPorAsesor.map((r) => [r.asesor, Number(r.n)]));

  const miembros = (await listarMiembros(organizationId)).filter((m) => !asesor || m.userId === asesor);
  const porAsesor = miembros.map((m) => {
    const cots = cotizaciones.filter((c) => c.asesorUserId === m.userId);
    const env = cots.filter((c) => c.estado === "enviada");
    const reus = reuniones.filter((r) => r.asesorUserId === m.userId && r.estado !== "cancelada");
    return {
      nombre: m.nombre,
      clientes: mapaClientes.get(m.userId) ?? 0,
      cotizaciones: cots.length,
      enviadas: env.length,
      montoEnviado: env.reduce((s, c) => s + c.totalCents, 0) / 100,
      reuniones: reus.length,
      realizadas: reus.filter((r) => r.estado === "realizada").length,
    };
  });

  // Serie diaria (zona de Colombia), con todos los días del rango.
  const nuevosPorDia = await db
    .select({ d: sql<string>`to_char(${schema.contact.createdAt} at time zone 'UTC' at time zone 'America/Bogota', 'YYYY-MM-DD')`, n: count() })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, enRango(schema.contact.createdAt), deMisClientes))
    .groupBy(sql`1`);
  const mapaNuevos = new Map(nuevosPorDia.map((r) => [r.d, Number(r.n)]));
  const porDia: Informe["porDia"] = [];
  for (let t = new Date(desde); t < hasta && porDia.length < 400; t = new Date(t.getTime() + 86_400_000)) {
    const d = dia(t);
    if (porDia.at(-1)?.dia === d) continue;
    const delDia = cotizaciones.filter((c) => dia(c.createdAt) === d);
    porDia.push({
      dia: d,
      cotizaciones: delDia.length,
      monto: delDia.filter((c) => c.estado === "enviada").reduce((s, c) => s + c.totalCents, 0) / 100,
      clientesNuevos: mapaNuevos.get(d) ?? 0,
    });
  }

  const proximas = await db
    .select({
      inicio: schema.reunion.inicio,
      titulo: schema.reunion.titulo,
      cliente: schema.contact.name,
      asesor: schema.user.name,
    })
    .from(schema.reunion)
    .innerJoin(schema.contact, eq(schema.reunion.contactId, schema.contact.id))
    .leftJoin(schema.user, eq(schema.reunion.asesorUserId, schema.user.id))
    .where(
      scoped(
        schema.reunion.organizationId,
        organizationId,
        eq(schema.reunion.estado, "programada"),
        gte(schema.reunion.inicio, new Date()),
        asesor ? eq(schema.reunion.asesorUserId, asesor) : undefined
      )
    )
    .orderBy(asc(schema.reunion.inicio))
    .limit(50);

  const enviadas = cotizaciones.filter((c) => c.estado === "enviada");
  return {
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    kpis: {
      clientesNuevos: Number(clientesNuevos?.n ?? 0),
      conversacionesNuevas: Number(conversacionesNuevas?.n ?? 0),
      cotizaciones: cotizaciones.length,
      cotizacionesEnviadas: enviadas.length,
      montoEnviado: enviadas.reduce((s, c) => s + c.totalCents, 0) / 100,
      reunionesProgramadas: reuniones.filter((r) => r.estado !== "cancelada").length,
      reunionesRealizadas: reuniones.filter((r) => r.estado === "realizada").length,
      sinAsesor: asesor ? 0 : Number(sinAsesor?.n ?? 0),
    },
    porEtapa: etapas.map((e) => ({ etapa: e.etapa, tipo: e.tipo, leads: Number(e.leads) })),
    porAsesor,
    porDia,
    proximasReuniones: proximas.map((p) => ({
      inicio: p.inicio.toISOString(),
      titulo: p.titulo,
      cliente: p.cliente,
      asesor: p.asesor,
    })),
  };
}

/* ---------- Exportaciones CSV (abren en Excel) ---------- */

function csv(filas: (string | number | null)[][]): string {
  const celda = (v: string | number | null) => {
    const t = v === null ? "" : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  // Punto y coma: es el separador que Excel en español abre en columnas.
  return "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n");
}

export async function exportarCsv(
  organizationId: string,
  tipo: "leads" | "cotizaciones" | "reuniones",
  desde: Date,
  hasta: Date,
  asesor?: string
): Promise<string> {
  const db = getDb();
  const fecha = (d: Date | null) =>
    d ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" }).format(d) : "";
  if (tipo === "leads") {
    const filas = await db
      .select({
        cliente: schema.contact.name,
        telefono: schema.contact.phone,
        etapa: schema.pipelineStage.name,
        asesor: schema.user.name,
        prioridad: schema.lead.priority,
        creado: schema.lead.createdAt,
        actividad: schema.lead.lastActivityAt,
      })
      .from(schema.lead)
      .innerJoin(schema.contact, eq(schema.lead.contactId, schema.contact.id))
      .innerJoin(schema.pipelineStage, eq(schema.lead.stageId, schema.pipelineStage.id))
      .leftJoin(schema.user, eq(schema.contact.asesorUserId, schema.user.id))
      .where(
        scoped(
          schema.lead.organizationId,
          organizationId,
          asesor ? eq(schema.contact.asesorUserId, asesor) : undefined
        )
      )
      .orderBy(asc(schema.pipelineStage.position));
    return csv([
      ["Cliente", "Teléfono", "Etapa", "Asesor", "Prioridad", "Creado", "Última actividad"],
      ...filas.map((f) => [f.cliente, f.telefono, f.etapa, f.asesor ?? "Sin asesor", f.prioridad, fecha(f.creado), fecha(f.actividad)]),
    ]);
  }
  if (tipo === "cotizaciones") {
    const filas = await db
      .select({ cot: schema.cotizacion, cliente: schema.contact.name, asesor: schema.user.name })
      .from(schema.cotizacion)
      .innerJoin(schema.contact, eq(schema.cotizacion.contactId, schema.contact.id))
      .leftJoin(schema.user, eq(schema.cotizacion.asesorUserId, schema.user.id))
      .where(
        scoped(
          schema.cotizacion.organizationId,
          organizationId,
          and(gte(schema.cotizacion.createdAt, desde), lt(schema.cotizacion.createdAt, hasta)),
          asesor ? eq(schema.cotizacion.asesorUserId, asesor) : undefined
        )
      )
      .orderBy(asc(schema.cotizacion.numero));
    return csv([
      ["Número", "Cliente", "Asesor", "Estado", "Subtotal", "Total con IVA", "Creada", "Enviada"],
      ...filas.map((f) => [
        `COT-${String(f.cot.numero).padStart(4, "0")}`,
        f.cliente,
        f.asesor,
        f.cot.estado,
        f.cot.subtotalCents / 100,
        f.cot.totalCents / 100,
        fecha(f.cot.createdAt),
        fecha(f.cot.enviadaAt),
      ]),
    ]);
  }
  const filas = await db
    .select({ r: schema.reunion, cliente: schema.contact.name, asesor: schema.user.name })
    .from(schema.reunion)
    .innerJoin(schema.contact, eq(schema.reunion.contactId, schema.contact.id))
    .leftJoin(schema.user, eq(schema.reunion.asesorUserId, schema.user.id))
    .where(
      scoped(
        schema.reunion.organizationId,
        organizationId,
        and(gte(schema.reunion.inicio, desde), lt(schema.reunion.inicio, hasta)),
        asesor ? eq(schema.reunion.asesorUserId, asesor) : undefined
      )
    )
    .orderBy(asc(schema.reunion.inicio));
  return csv([
    ["Fecha", "Asunto", "Cliente", "Asesor", "Duración (min)", "Lugar", "Estado"],
    ...filas.map((f) => [fecha(f.r.inicio), f.r.titulo, f.cliente, f.asesor, f.r.duracionMin, f.r.lugar, f.r.estado]),
  ]);
}
