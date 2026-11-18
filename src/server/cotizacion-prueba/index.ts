import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { nichoDe, plantillaPrueba, prometeCotizacionPrueba, yaSalio } from "@/lib/cotizacion-prueba";
import { adminPrincipal, notaDelSistema } from "@/server/asesores";
import { upsertFicha } from "@/server/bot/ficha";
import { CLAVES, correoEnTexto, deFicha } from "@/server/cotizaciones";
import { enviarCorreo } from "@/server/correo";
import { generarPdfPrueba } from "./pdf";

/**
 * Syrtel — la IA pidió la cotización de prueba (`cotizacion_prueba` en la
 * ficha): el CRM arma el PDF de ejemplo del nicho y lo envía por WhatsApp al
 * chat y por correo al prospecto. Una sola vez por prospecto.
 *
 * Correo de envío: el correo de la IA (Agente de IA → Correo de la IA); si no
 * está, el del administrador principal; si tampoco, el último configurado. Cada canal es independiente: si uno falla, el
 * otro sale igual, y el resultado queda como nota interna en el hilo.
 */

/**
 * Quién envía el correo: `{ de: null }` = el correo de la IA; si no está, el
 * administrador principal o el último correo configurado. `undefined` = nadie.
 */
async function remitente(organizationId: string): Promise<{ de: string | null } | undefined> {
  const db = getDb();
  const [ia] = await db
    .select({ id: schema.asesorCorreo.id })
    .from(schema.asesorCorreo)
    .where(scoped(schema.asesorCorreo.organizationId, organizationId, isNull(schema.asesorCorreo.userId)))
    .limit(1);
  if (ia) return { de: null };
  const admin = await adminPrincipal(organizationId);
  if (admin) {
    const [a] = await db
      .select({ userId: schema.asesorCorreo.userId })
      .from(schema.asesorCorreo)
      .where(scoped(schema.asesorCorreo.organizationId, organizationId, eq(schema.asesorCorreo.userId, admin.userId)))
      .limit(1);
    if (a?.userId) return { de: a.userId };
  }
  const [ultimo] = await db
    .select({ userId: schema.asesorCorreo.userId })
    .from(schema.asesorCorreo)
    .innerJoin(schema.member, eq(schema.member.userId, schema.asesorCorreo.userId))
    .where(scoped(schema.asesorCorreo.organizationId, organizationId, isNotNull(schema.asesorCorreo.userId)))
    .orderBy(desc(schema.asesorCorreo.updatedAt))
    .limit(1);
  return ultimo?.userId ? { de: ultimo.userId } : undefined;
}

/**
 * El correo del prospecto: el de la ficha o, si la IA no lo guardó en su
 * clave, el que escribió en el chat. Si sale del chat, queda en la ficha.
 */
async function correoDelProspecto(
  organizationId: string,
  conversationId: string,
  contactId: string,
  ficha: Record<string, unknown>
): Promise<string | null> {
  const enFicha = deFicha(ficha, CLAVES.correo);
  if (enFicha) return enFicha;
  const recibidos = await getDb()
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
  const correo = correoEnTexto(recibidos.map((m) => m.text));
  if (correo) await upsertFicha({ organizationId, contactId, ficha: { correo } }).catch(() => {});
  return correo;
}

/** Dispara la cotización de prueba si la IA la prometió y aún no ha salido. */
export async function siLaPrometio(organizationId: string, conversationId: string, texto: string): Promise<void> {
  if (!prometeCotizacionPrueba(texto)) return;
  const db = getDb();
  const [fila] = await db
    .select({ contactId: schema.contact.id, ficha: schema.contact.ficha })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.conversation.contactId, schema.contact.id))
    .where(and(eq(schema.conversation.organizationId, organizationId), eq(schema.conversation.id, conversationId)))
    .limit(1);
  if (!fila) return;
  const ficha = (fila.ficha ?? {}) as Record<string, unknown>;
  if (yaSalio(ficha.cotizacion_prueba)) return;
  await upsertFicha({ organizationId, contactId: fila.contactId, ficha: { cotizacion_prueba: "enviando" } });
  await enviarCotizacionPrueba(organizationId, conversationId);
}

export async function enviarCotizacionPrueba(organizationId: string, conversationId: string): Promise<void> {
  const db = getDb();
  const [fila] = await db
    .select({
      contactId: schema.contact.id,
      nombre: schema.contact.name,
      ficha: schema.contact.ficha,
      isTest: schema.conversation.isTest,
      channel: schema.conversation.channel,
    })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.conversation.contactId, schema.contact.id))
    .where(and(eq(schema.conversation.organizationId, organizationId), eq(schema.conversation.id, conversationId)))
    .limit(1);
  if (!fila) return;

  const ficha = (fila.ficha ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const nombre = str(ficha.nombre) ?? fila.nombre ?? "Cliente";
  const empresa = deFicha(ficha, CLAVES.empresa);
  const correo = await correoDelProspecto(organizationId, conversationId, fila.contactId, ficha);
  // El nicho que anotó la IA; si no usó la clave, se busca en toda la ficha.
  const plantilla = plantillaPrueba(
    nichoDe(str(ficha.nicho) ?? Object.values(ficha).filter((v): v is string => typeof v === "string").join(" "))
  );
  const numero = `EJ-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const pdf = await generarPdfPrueba({ numero, fecha: new Date(), cliente: { nombre, empresa, correo }, plantilla });
  const archivo = `Cotizacion-ejemplo-Syrtel-CRM-${numero}.pdf`;

  const canales: string[] = [];
  const problemas: string[] = [];

  // WhatsApp (o el canal del chat). En el Laboratorio no sale nada: sandbox.
  if (fila.isTest) {
    problemas.push("Laboratorio: el PDF se generó pero no se envía");
  } else {
    try {
      const { sendMediaMessage } = await import("@/server/inbox/send");
      await sendMediaMessage({
        conversationId,
        organizationId,
        file: { data: pdf, mimeType: "application/pdf", fileName: archivo },
        caption: `Aquí tiene una cotización de ejemplo (${plantilla.titulo.toLowerCase()}): así la recibirían sus clientes desde Syrtel CRM. Los productos y valores son ficticios.`,
      });
      canales.push(fila.channel === "whatsapp" ? "WhatsApp" : fila.channel);
    } catch (err) {
      problemas.push(`chat: ${err instanceof Error ? err.message : "falló"}`);
    }
  }

  // Correo.
  if (!fila.isTest && correo) {
    const quien = await remitente(organizationId);
    if (!quien) {
      problemas.push("correo: nadie tiene configurado el correo de envío");
    } else {
      try {
        await enviarCorreo(organizationId, quien.de, {
          para: correo,
          asunto: `Cotización de ejemplo ${numero} — Syrtel CRM`,
          texto:
            `Hola ${nombre}:\n\nComo conversamos por WhatsApp, le compartimos una cotización de ejemplo generada con Syrtel CRM. ` +
            `Así la recibirían sus clientes: con su logo, imágenes de los productos, totales con IVA y envío por WhatsApp y correo.\n\n` +
            `Los productos y los valores son ficticios: no es una oferta comercial. La propuesta con el valor de Syrtel CRM se la enviamos después de la demo.\n\n` +
            `Cordialmente,\nEquipo de Syrtel Solutions\nsyrtelsolutions.com`,
          adjuntos: [{ nombre: archivo, contenido: pdf, tipo: "application/pdf" }],
        });
        canales.push(`correo (${correo})`);
      } catch (err) {
        problemas.push(`correo: ${err instanceof Error ? err.message : "falló"}`);
      }
    }
  } else if (!fila.isTest) {
    problemas.push("correo: el prospecto aún no dio su correo");
  }

  await upsertFicha({
    organizationId,
    contactId: fila.contactId,
    ficha: {
      cotizacion_prueba: canales.length > 0 ? `enviada por ${canales.join(" y ")}` : "enviada (falló el envío)",
    },
  }).catch(() => {});
  await notaDelSistema(
    organizationId,
    conversationId,
    `🧾 Cotización de prueba ${numero} (${plantilla.titulo})` +
      (canales.length ? ` enviada por ${canales.join(" y ")}.` : " no se pudo enviar.") +
      (problemas.length ? ` Pendiente: ${problemas.join(" · ")}.` : "")
  ).catch(() => {});
}
