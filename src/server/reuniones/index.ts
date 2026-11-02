import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { veTodo } from "@/lib/asesores";
import { eventoIcs, fechaReunion, RECORDATORIOS, type ReunionDto } from "@/lib/reuniones";
import { notaDelSistema } from "@/server/asesores";
import { CorreoError, enviarCorreo, miCorreo } from "@/server/correo";
import { CLAVES, deFicha } from "@/server/cotizaciones";

/**
 * Petrominal — reuniones de los asesores con sus clientes: invitación por el
 * correo del asesor (con evento de calendario) y por WhatsApp al cliente, y
 * recordatorios automáticos 24 h y 1 h antes al cliente y al asesor.
 */

export class ReunionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type Sesion = { organizationId: string; userId: string; role: string };
type Fila = typeof schema.reunion.$inferSelect;

export const crearSchema = z.object({
  contactId: z.string().min(1),
  titulo: z.string().trim().min(1).max(200),
  inicio: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida"),
  duracionMin: z.number().int().min(10).max(600),
  lugar: z.string().trim().max(500).nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
  correoCliente: z.string().trim().email().nullable().optional(),
  invitarPorCorreo: z.boolean(),
  avisarPorWhatsapp: z.boolean(),
});

async function contexto(organizationId: string, r: Fila) {
  const db = getDb();
  const [contacto] = await db.select().from(schema.contact).where(eq(schema.contact.id, r.contactId)).limit(1);
  const [asesor] = r.asesorUserId
    ? await db
        .select({ id: schema.user.id, nombre: schema.user.name, email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.id, r.asesorUserId))
        .limit(1)
    : [];
  const [conv] = contacto
    ? await db
        .select({ id: schema.conversation.id })
        .from(schema.conversation)
        .where(
          and(
            eq(schema.conversation.organizationId, organizationId),
            eq(schema.conversation.contactId, contacto.id),
            eq(schema.conversation.channel, "whatsapp"),
            eq(schema.conversation.isTest, false)
          )
        )
        .orderBy(desc(schema.conversation.lastMessageAt))
        .limit(1)
    : [];
  return { contacto: contacto ?? null, asesor: asesor ?? null, conversacionId: conv?.id ?? null };
}

function aDto(r: Fila, c: Awaited<ReturnType<typeof contexto>>): ReunionDto {
  return {
    id: r.id,
    titulo: r.titulo,
    inicio: r.inicio.toISOString(),
    duracionMin: r.duracionMin,
    lugar: r.lugar,
    notas: r.notas,
    estado: r.estado,
    contacto: { id: r.contactId, nombre: c.contacto?.name ?? "Cliente", telefono: c.contacto?.phone ?? null },
    correoCliente: r.correoCliente,
    asesor: c.asesor ? { userId: c.asesor.id, nombre: c.asesor.nombre } : null,
    invitacion: r.invitacion ?? null,
    recordatorios: r.recordatorios ?? null,
  };
}

type Tipo = "invitacion" | "recordatorio" | "cancelacion";

/**
 * Avisa al cliente (correo con evento de calendario y WhatsApp) y al asesor
 * (correo). Cada canal es independiente: si uno falla, los demás salen igual,
 * y el resultado queda anotado. Nunca lanza.
 */
async function notificar(
  organizationId: string,
  r: Fila,
  tipo: Tipo,
  canales: { correo: boolean; whatsapp: boolean },
  etiqueta?: string
): Promise<Record<string, string>> {
  const c = await contexto(organizationId, r);
  const resultado: Record<string, string> = {};
  const cuando = fechaReunion(r.inicio.toISOString());
  const lugar = r.lugar ? `\nLugar: ${r.lugar}` : "";
  const asesorNombre = c.asesor?.nombre ?? "su asesor de Petrominal";
  const encabezado =
    tipo === "invitacion"
      ? `Reunión programada con Petrominal S.A.S.`
      : tipo === "cancelacion"
        ? `Reunión cancelada`
        : `Recordatorio: reunión ${etiqueta ?? ""}`.trim();
  const texto =
    tipo === "cancelacion"
      ? `Hola ${c.contacto?.name ?? ""}, la reunión "${r.titulo}" del ${cuando} fue cancelada. ${asesorNombre} se comunicará con usted para reprogramarla.`
      : `${encabezado}\n\n"${r.titulo}"\nFecha: ${cuando} (hora de Colombia)\nDuración: ${r.duracionMin} minutos${lugar}\nCon: ${asesorNombre}${r.notas ? `\n\n${r.notas}` : ""}`;

  // Correo al cliente, desde la cuenta del asesor, con el evento.
  const correoAsesor = r.asesorUserId ? await miCorreo(organizationId, r.asesorUserId) : null;
  if (canales.correo && r.correoCliente && r.asesorUserId && correoAsesor) {
    try {
      await enviarCorreo(organizationId, r.asesorUserId, {
        para: r.correoCliente,
        asunto: `${encabezado}: ${r.titulo}`,
        texto,
        eventoIcs:
          tipo === "recordatorio"
            ? undefined
            : eventoIcs({
                id: r.id,
                titulo: r.titulo,
                inicio: r.inicio,
                duracionMin: r.duracionMin,
                lugar: r.lugar,
                descripcion: texto,
                organizador: { nombre: c.asesor?.nombre ?? "Petrominal", correo: correoAsesor.usuario },
                invitado: { nombre: c.contacto?.name ?? "Cliente", correo: r.correoCliente },
                cancelar: tipo === "cancelacion",
              }),
      });
      resultado.correoCliente = "enviado";
    } catch (err) {
      resultado.correoCliente = err instanceof CorreoError ? err.message : "falló";
    }
  } else if (canales.correo) {
    resultado.correoCliente = !r.correoCliente
      ? "sin correo del cliente"
      : "el asesor no tiene correo de envío configurado";
  }

  // WhatsApp al cliente, en su conversación.
  if (canales.whatsapp && c.conversacionId) {
    try {
      const { sendText } = await import("@/server/inbox/send");
      await sendText({
        conversationId: c.conversacionId,
        organizationId,
        text: tipo === "cancelacion" ? texto : `📅 ${texto}`,
      });
      resultado.whatsapp = "enviado";
    } catch (err) {
      const e = err as { code?: string; message?: string };
      resultado.whatsapp =
        e.code === "window_closed"
          ? "no enviado: pasaron más de 24 h desde el último mensaje del cliente"
          : (e.message ?? "falló");
    }
  } else if (canales.whatsapp) {
    resultado.whatsapp = "el cliente no tiene conversación de WhatsApp";
  }

  // Correo al asesor (su propia cuenta se lo envía a sí mismo).
  if (tipo !== "invitacion" && r.asesorUserId && correoAsesor && c.asesor?.email) {
    try {
      await enviarCorreo(organizationId, r.asesorUserId, {
        para: correoAsesor.usuario,
        asunto: `${encabezado}: ${r.titulo} con ${c.contacto?.name ?? "cliente"}`,
        texto: `${texto}\n\nCliente: ${c.contacto?.name ?? ""}${c.contacto?.phone ? ` (+${c.contacto.phone})` : ""}`,
      });
      resultado.correoAsesor = "enviado";
    } catch (err) {
      resultado.correoAsesor = err instanceof CorreoError ? err.message : "falló";
    }
  }

  if (c.conversacionId) {
    const resumen = Object.entries(resultado)
      .map(([k, v]) => `${k === "correoCliente" ? "correo al cliente" : k === "correoAsesor" ? "correo al asesor" : "WhatsApp"}: ${v}`)
      .join(" · ");
    await notaDelSistema(
      organizationId,
      c.conversacionId,
      `📅 ${encabezado} — "${r.titulo}", ${cuando}. ${resumen}`
    ).catch(() => {});
  }
  return resultado;
}

export async function crearReunion(sesion: Sesion, datos: z.infer<typeof crearSchema>): Promise<ReunionDto> {
  const db = getDb();
  const [contacto] = await db
    .select()
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, sesion.organizationId, eq(schema.contact.id, datos.contactId)))
    .limit(1);
  if (!contacto || (!veTodo(sesion.role) && contacto.asesorUserId !== sesion.userId)) {
    throw new ReunionError(404, "not_found", "Cliente no encontrado");
  }
  const inicio = new Date(datos.inicio);
  if (inicio.getTime() < Date.now() - 5 * 60_000) {
    throw new ReunionError(422, "pasado", "La reunión debe ser en el futuro");
  }
  const correoCliente = datos.correoCliente || deFicha(contacto.ficha, CLAVES.correo);
  const [fila] = await db
    .insert(schema.reunion)
    .values({
      id: newId("reunion"),
      organizationId: sesion.organizationId,
      contactId: contacto.id,
      // Es del asesor que la programa (o del asesor del cliente si la programa la administración).
      asesorUserId: veTodo(sesion.role) ? (contacto.asesorUserId ?? sesion.userId) : sesion.userId,
      titulo: datos.titulo,
      inicio,
      duracionMin: datos.duracionMin,
      lugar: datos.lugar || null,
      notas: datos.notas || null,
      correoCliente,
    })
    .returning();
  const invitacion = await notificar(sesion.organizationId, fila!, "invitacion", {
    correo: datos.invitarPorCorreo,
    whatsapp: datos.avisarPorWhatsapp,
  });
  const [final] = await db
    .update(schema.reunion)
    .set({ invitacion, updatedAt: new Date() })
    .where(eq(schema.reunion.id, fila!.id))
    .returning();
  return aDto(final!, await contexto(sesion.organizationId, final!));
}

async function filaVisible(sesion: Sesion, id: string): Promise<Fila> {
  const [fila] = await getDb()
    .select()
    .from(schema.reunion)
    .where(scoped(schema.reunion.organizationId, sesion.organizationId, eq(schema.reunion.id, id)))
    .limit(1);
  if (!fila || (!veTodo(sesion.role) && fila.asesorUserId !== sesion.userId)) {
    throw new ReunionError(404, "not_found", "Reunión no encontrada");
  }
  return fila;
}

export async function cambiarEstado(
  sesion: Sesion,
  id: string,
  estado: "realizada" | "cancelada",
  avisar: boolean
): Promise<ReunionDto> {
  const fila = await filaVisible(sesion, id);
  const [nueva] = await getDb()
    .update(schema.reunion)
    .set({ estado, updatedAt: new Date() })
    .where(eq(schema.reunion.id, id))
    .returning();
  if (estado === "cancelada" && avisar && fila.estado === "programada") {
    await notificar(sesion.organizationId, nueva!, "cancelacion", { correo: true, whatsapp: true });
  }
  return aDto(nueva!, await contexto(sesion.organizationId, nueva!));
}

export async function listarReuniones(sesion: Sesion, opciones: { desde?: Date } = {}): Promise<ReunionDto[]> {
  const desde = opciones.desde ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const filas = await getDb()
    .select()
    .from(schema.reunion)
    .where(
      scoped(
        schema.reunion.organizationId,
        sesion.organizationId,
        gte(schema.reunion.inicio, desde),
        veTodo(sesion.role) ? undefined : eq(schema.reunion.asesorUserId, sesion.userId)
      )
    )
    .orderBy(asc(schema.reunion.inicio))
    .limit(500);
  return Promise.all(filas.map(async (f) => aDto(f, await contexto(sesion.organizationId, f))));
}

/* ---------- Recordatorios (en proceso, cada minuto) ---------- */

let temporizador: ReturnType<typeof setInterval> | null = null;
let corriendo = false;

export async function pasadaDeRecordatorios(ahora = new Date()): Promise<number> {
  if (corriendo) return 0;
  corriendo = true;
  let enviados = 0;
  try {
    const db = getDb();
    const max = Math.max(...RECORDATORIOS.map((r) => r.antesMs));
    const proximas = await db
      .select()
      .from(schema.reunion)
      .where(
        and(
          eq(schema.reunion.estado, "programada"),
          gte(schema.reunion.inicio, ahora),
          lte(schema.reunion.inicio, new Date(ahora.getTime() + max))
        )
      )
      .orderBy(asc(schema.reunion.inicio))
      .limit(200);
    for (const r of proximas) {
      const hechos = { ...(r.recordatorios ?? {}) };
      // Solo el recordatorio más cercano que toque; los anteriores se saltan.
      const pendientes = RECORDATORIOS.filter(
        (x) => !hechos[x.clave] && ahora.getTime() >= r.inicio.getTime() - x.antesMs
      );
      if (pendientes.length === 0) continue;
      const toca = pendientes[pendientes.length - 1]!;
      for (const x of pendientes) hechos[x.clave] = x === toca ? "" : "omitido";
      // Un recordatorio de «mañana» no tiene sentido si se agendó con menos anticipación.
      const anticipacion = r.inicio.getTime() - r.createdAt.getTime();
      if (anticipacion > toca.antesMs) {
        await notificar(r.organizationId, r, "recordatorio", { correo: true, whatsapp: true }, toca.etiqueta);
        enviados++;
        hechos[toca.clave] = new Date().toISOString();
      } else {
        hechos[toca.clave] = "omitido";
      }
      await db
        .update(schema.reunion)
        .set({ recordatorios: hechos, updatedAt: new Date() })
        .where(eq(schema.reunion.id, r.id));
    }
  } catch (err) {
    console.error("[reuniones] pasada de recordatorios falló:", err);
  } finally {
    corriendo = false;
  }
  return enviados;
}

export function iniciarRecordatorios(): void {
  if (temporizador) return;
  temporizador = setInterval(() => void pasadaDeRecordatorios(), 60_000);
  temporizador.unref?.();
}
