import { after } from "next/server";
import { z } from "zod";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";
import { getZernioWhatsappByOrg } from "@/server/zernio-whatsapp/credentials";
import { marcarLeidoPorZernio } from "@/server/zernio-whatsapp/ingest";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { newId } from "@/lib/db/ids";
import { construirEventoOlvido } from "@/server/brains/contract";
import { avisarOlvido, type ResultadoOlvido } from "@/server/brains/deliver";
import { publish } from "@/server/events/bus";
import { eliminarConversacion } from "@/server/inbox/eliminar";
import { serializeConversation, getConversation, updateConversation } from "@/server/inbox/queries";
import { puedeVerConversacion } from "@/server/asesores";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  aiEnabled: z.boolean().optional(),
  reactivate: z.boolean().optional(),
  markRead: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  // Petrominal — un asesor solo abre las conversaciones de su cartera.
  if (!(await puedeVerConversacion(session, id))) return apiError(404, "not_found", "Conversación no encontrada");
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  // Petrominal — leer la conversación por WhatsApp-Zernio le avisa al cliente
  // (doble check azul). Solo si había algo sin leer, para no repetirlo.
  const antes = body.data.markRead ? await getConversation(session.organizationId, id) : null;
  const updated = await updateConversation(session.organizationId, id, body.data);
  if (
    antes &&
    antes.conversation.unreadCount > 0 &&
    antes.conversation.channel === "whatsapp" &&
    antes.conversation.channelThreadRef &&
    !antes.conversation.isTest
  ) {
    const threadRef = antes.conversation.channelThreadRef;
    const orgId = session.organizationId;
    after(async () => {
      if (await getCredentialsByOrg(orgId)) return; // número directo de Meta: no aplica
      const zw = await getZernioWhatsappByOrg(orgId);
      if (zw && zw.status === "connected") await marcarLeidoPorZernio(zw, threadRef);
    });
  }
  if (!updated) return apiError(404, "not_found", "Conversación no encontrada");

  const row = await getConversation(session.organizationId, id);
  if (row) {
    const dto = serializeConversation(
      row.conversation,
      row.contact,
      null,
      null,
      row.anuncio
    );
    publish(session.organizationId, {
      type: "conversation.updated",
      data: { conversation: dto },
    });
    return Response.json({ conversation: dto });
  }
  return Response.json({ conversation: null });
});

const FECHA_DE_CITA = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" });

/**
 * 026 — Elimina la conversación y le pide al cerebro que la olvide.
 *
 * `?contacto=1` se lleva además a la persona: contacto, lead y citas pasadas.
 * Es irreversible en los dos casos, y por eso exige rol de configuración
 * (propietario o administrador) y no solo operar la bandeja.
 */
export const DELETE = withAuth(async (session, req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(
      403,
      "forbidden",
      "Solo quien administra el negocio puede eliminar conversaciones"
    );
  }
  const { id } = await ctx.params;
  // Petrominal — un asesor solo abre las conversaciones de su cartera.
  if (!(await puedeVerConversacion(session, id))) return apiError(404, "not_found", "Conversación no encontrada");
  const alcance =
    new URL(req.url).searchParams.get("contacto") === "1" ? "contacto" : "hilo";

  const resultado = await eliminarConversacion(session.organizationId, id, alcance);
  if (!resultado.ok) {
    if (resultado.motivo === "cita_pendiente") {
      return apiError(
        409,
        "cita_pendiente",
        `Tiene una cita agendada para el ${FECHA_DE_CITA.format(resultado.cuando)}. Cancélala en Citas antes de eliminar.`
      );
    }
    return apiError(404, "not_found", "Conversación no encontrada");
  }

  // Irreversible y sin papelera: que al menos quede quién y cuándo. Solo ids.
  console.info(
    `[bandeja] ${session.userId} eliminó ${id} (${alcance}) en ${session.organizationId}`
  );

  // El aviso va DESPUÉS del borrado y no lo condiciona: lo que se pidió ya
  // pasó, y un cerebro caído no puede dejar la conversación en la bandeja.
  let agente: ResultadoOlvido = "no_aplica";
  const deletedAt = new Date();
  for (const conversacion of resultado.conversaciones) {
    const aviso = await avisarOlvido(
      construirEventoOlvido({
        eventId: newId("olvido"),
        organization: resultado.organization,
        conversation: conversacion,
        contact: resultado.contact,
        deletedAt,
      })
    );
    if (aviso === "sin_confirmar" || agente === "no_aplica") agente = aviso;
  }

  for (const conversacion of resultado.conversaciones) {
    publish(session.organizationId, {
      type: "conversation.deleted",
      data: {
        conversationId: conversacion.id,
        contactId: resultado.contact.id,
        contactDeleted: alcance === "contacto",
      },
    });
  }
  return Response.json({ ok: true, alcance, agente });
});
