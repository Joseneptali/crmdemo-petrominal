import { and, asc, eq, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { veTodo, type MiembroDto } from "@/lib/asesores";
import type { NotaDto } from "@/lib/notas";
import { publish } from "@/server/events/bus";

/**
 * Petrominal — asesores comerciales: quién es dueño de cada cliente, quién
 * recibe los nuevos y qué ve cada quien.
 */

export class AsesorError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type Sesion = { organizationId: string; userId: string; role: string };

/**
 * La condición de cartera para las listas: un asesor solo ve los clientes que
 * tiene asignados; quien configura lo ve todo (undefined = sin filtro).
 * Se usa junto a una consulta que ya une `contact`.
 */
export function condicionDeCartera(sesion: Sesion): SQL | undefined {
  return veTodo(sesion.role) ? undefined : eq(schema.contact.asesorUserId, sesion.userId);
}

/** ¿Quien mira puede abrir este contacto? */
export async function puedeVerContacto(sesion: Sesion, contactId: string): Promise<boolean> {
  if (veTodo(sesion.role)) return true;
  const [fila] = await getDb()
    .select({ asesor: schema.contact.asesorUserId })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, sesion.organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  return !!fila && fila.asesor === sesion.userId;
}

/** ¿Quien mira puede abrir esta conversación? (por el contacto). */
export async function puedeVerConversacion(sesion: Sesion, conversationId: string): Promise<boolean> {
  if (veTodo(sesion.role)) return true;
  const [fila] = await getDb()
    .select({ asesor: schema.contact.asesorUserId })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.conversation.contactId, schema.contact.id))
    .where(
      scoped(
        schema.conversation.organizationId,
        sesion.organizationId,
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  return !!fila && fila.asesor === sesion.userId;
}

export async function listarMiembros(organizationId: string): Promise<MiembroDto[]> {
  const filas = await getDb()
    .select({
      userId: schema.member.userId,
      rol: schema.member.role,
      nombre: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, organizationId))
    .orderBy(asc(schema.user.name));
  return filas.map((f) => ({ userId: f.userId, rol: f.rol, nombre: f.nombre, email: f.email }));
}

async function miembro(organizationId: string, userId: string): Promise<MiembroDto | null> {
  const todos = await listarMiembros(organizationId);
  return todos.find((m) => m.userId === userId) ?? null;
}

/** Quien recibe los clientes nuevos o sin asesor: el elegido, o el propietario. */
export async function adminPrincipal(organizationId: string): Promise<MiembroDto | null> {
  const [aj] = await getDb()
    .select({ id: schema.petrominalAjustes.adminPrincipalUserId })
    .from(schema.petrominalAjustes)
    .where(scoped(schema.petrominalAjustes.organizationId, organizationId))
    .limit(1);
  const miembros = await listarMiembros(organizationId);
  return (
    (aj?.id ? miembros.find((m) => m.userId === aj.id) : undefined) ??
    miembros.find((m) => m.rol === "owner") ??
    null
  );
}

export async function fijarAdminPrincipal(organizationId: string, userId: string): Promise<void> {
  if (!(await miembro(organizationId, userId))) {
    throw new AsesorError(422, "no_miembro", "Esa persona no es del equipo");
  }
  const db = getDb();
  const [aj] = await db
    .select({ id: schema.petrominalAjustes.id })
    .from(schema.petrominalAjustes)
    .where(scoped(schema.petrominalAjustes.organizationId, organizationId))
    .limit(1);
  if (aj) {
    await db
      .update(schema.petrominalAjustes)
      .set({ adminPrincipalUserId: userId, updatedAt: new Date() })
      .where(eq(schema.petrominalAjustes.id, aj.id));
  } else {
    await db.insert(schema.petrominalAjustes).values({
      id: newId("petrominalAjustes"),
      organizationId,
      adminPrincipalUserId: userId,
    });
  }
}

/** Asigna (o quita, con null) el asesor de un cliente. */
export async function asignarAsesor(
  organizationId: string,
  contactId: string,
  asesorUserId: string | null
): Promise<MiembroDto | null> {
  const asesor = asesorUserId ? await miembro(organizationId, asesorUserId) : null;
  if (asesorUserId && !asesor) {
    throw new AsesorError(422, "no_miembro", "Esa persona no es del equipo");
  }
  const [previo] = await getDb()
    .select({ asesor: schema.contact.asesorUserId })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  const anterior = previo?.asesor ?? null;
  const [fila] = await getDb()
    .update(schema.contact)
    .set({ asesorUserId, updatedAt: new Date() })
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .returning({ id: schema.contact.id });
  if (!fila) throw new AsesorError(404, "not_found", "Contacto no encontrado");
  // Las bandejas abiertas recargan la lista en vivo: al asesor nuevo le
  // aparece el chat sin recargar la página, y al anterior se le quita.
  const convs = await getDb()
    .update(schema.conversation)
    .set({ updatedAt: new Date() })
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.contactId, contactId)))
    .returning({ id: schema.conversation.id });
  for (const c of convs) {
    publish(organizationId, { type: "conversation.updated", data: { conversation: { id: c.id } } });
  }
  if (convs[0]) {
    await notaDelSistema(
      organizationId,
      convs[0].id,
      asesor ? `👤 Cliente asignado al asesor ${asesor.nombre}.` : "👤 Se quitó el asesor asignado a este cliente."
    ).catch(() => {});
    if (asesor && asesor.userId !== anterior) {
      const [c] = await getDb()
        .select({ nombre: schema.contact.name, isTest: schema.conversation.isTest, channel: schema.conversation.channel })
        .from(schema.conversation)
        .innerJoin(schema.contact, eq(schema.conversation.contactId, schema.contact.id))
        .where(eq(schema.conversation.id, convs[0].id))
        .limit(1);
      if (c && !c.isTest && c.channel === "whatsapp") {
        await presentarAsesorAlCliente(organizationId, convs[0].id, asesor.nombre, c.nombre);
      }
    }
  }
  return asesor;
}

export async function asesorDeContacto(
  organizationId: string,
  contactId: string
): Promise<MiembroDto | null> {
  const [fila] = await getDb()
    .select({ asesor: schema.contact.asesorUserId })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  return fila?.asesor ? miembro(organizationId, fila.asesor) : null;
}

/**
 * A quién va una conversación que la IA transfiere: al asesor del cliente si
 * tiene; si no (cliente nuevo o sin asignar), al administrador principal para
 * que decida a qué asesor dárselo.
 */
export async function destinoDeTransferencia(
  organizationId: string,
  contactId: string
): Promise<{ miembro: MiembroDto | null; porque: "asesor" | "admin" }> {
  const asesor = await asesorDeContacto(organizationId, contactId);
  if (asesor) return { miembro: asesor, porque: "asesor" };
  return { miembro: await adminPrincipal(organizationId), porque: "admin" };
}

/**
 * Una nota interna escrita por el sistema (sin autor): la ve el equipo en el
 * hilo, nunca el cliente.
 */
export async function notaDelSistema(
  organizationId: string,
  conversationId: string,
  texto: string
): Promise<void> {
  const [fila] = await getDb()
    .insert(schema.conversationNote)
    .values({
      id: newId("conversationNote"),
      organizationId,
      conversationId,
      authorUserId: null,
      texto,
    })
    .returning();
  if (!fila) return;
  const dto: NotaDto = {
    id: fila.id,
    conversationId,
    texto: fila.texto,
    createdAt: fila.createdAt.toISOString(),
    autor: null,
    puedeBorrar: false,
  };
  publish(organizationId, { type: "note.new", data: { conversationId, note: dto } });
}

/** El id del contacto de una conversación (para la transferencia). */
export async function contactoDeConversacion(
  organizationId: string,
  conversationId: string
): Promise<string | null> {
  const [fila] = await getDb()
    .select({ contactId: schema.conversation.contactId })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  return fila?.contactId ?? null;
}

/* ---------- Lo que ve el cliente: firma y presentación del asesor ---------- */

export type AjustesCliente = { firmarMensajes: boolean; presentarAsesor: boolean };

export async function leerAjustesCliente(organizationId: string): Promise<AjustesCliente> {
  const [aj] = await getDb()
    .select({
      firmar: schema.petrominalAjustes.firmarMensajes,
      presentar: schema.petrominalAjustes.presentarAsesor,
    })
    .from(schema.petrominalAjustes)
    .where(scoped(schema.petrominalAjustes.organizationId, organizationId))
    .limit(1);
  return { firmarMensajes: aj?.firmar ?? true, presentarAsesor: aj?.presentar ?? true };
}

export async function guardarAjustesCliente(organizationId: string, datos: AjustesCliente): Promise<void> {
  const db = getDb();
  const [aj] = await db
    .select({ id: schema.petrominalAjustes.id })
    .from(schema.petrominalAjustes)
    .where(scoped(schema.petrominalAjustes.organizationId, organizationId))
    .limit(1);
  const valores = { firmarMensajes: datos.firmarMensajes, presentarAsesor: datos.presentarAsesor, updatedAt: new Date() };
  if (aj) await db.update(schema.petrominalAjustes).set(valores).where(eq(schema.petrominalAjustes.id, aj.id));
  else await db.insert(schema.petrominalAjustes).values({ id: newId("petrominalAjustes"), organizationId, ...valores });
}

/** El texto con la firma del asesor (`*Nombre:*` en negrita de WhatsApp). */
export async function conFirma(organizationId: string, userId: string, texto: string): Promise<string> {
  const { firmarMensajes } = await leerAjustesCliente(organizationId);
  if (!firmarMensajes) return texto;
  const [u] = await getDb()
    .select({ nombre: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  const nombre = u?.nombre?.trim();
  return nombre ? `*${nombre}:*\n${texto}` : texto;
}

/**
 * Le presenta al cliente su asesor por WhatsApp. Best-effort: si la ventana de
 * 24 h está cerrada (o falla el envío), queda anotado y no se reintenta.
 */
export async function presentarAsesorAlCliente(
  organizationId: string,
  conversationId: string,
  asesorNombre: string,
  clienteNombre: string | null
): Promise<void> {
  const { presentarAsesor } = await leerAjustesCliente(organizationId);
  if (!presentarAsesor) return;
  const saludo = clienteNombre?.trim() ? `Hola ${clienteNombre.trim().split(/\s+/)[0]}, ` : "Hola, ";
  const texto = `${saludo}le saluda Petrominal S.A.S. 👋 Su asesor comercial asignado es *${asesorNombre}*, quien le atenderá personalmente.`;
  try {
    const { sendText } = await import("@/server/inbox/send");
    await sendText({ conversationId, organizationId, text: texto });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    await notaDelSistema(
      organizationId,
      conversationId,
      `No se pudo presentar el asesor al cliente por WhatsApp: ${
        e.code === "window_closed" ? "pasaron más de 24 h desde su último mensaje" : (e.message ?? "falló el envío")
      }.`
    ).catch(() => {});
  }
}
