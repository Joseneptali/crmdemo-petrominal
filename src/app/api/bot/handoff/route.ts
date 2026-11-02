import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { publish } from "@/server/events/bus";
import { toHandoffReason } from "@/server/bot/handoff";
import {
  contactoDeConversacion,
  destinoDeTransferencia,
  notaDelSistema,
} from "@/server/asesores";

/** Petrominal — a quién quedó la conversación, para el cerebro (informativo). */
async function destinoParaRespuesta(
  organizationId: string,
  conversationId: string
): Promise<{ asignadoA?: string; tipo?: "asesor" | "admin" }> {
  try {
    const contactId = await contactoDeConversacion(organizationId, conversationId);
    if (!contactId) return {};
    const d = await destinoDeTransferencia(organizationId, contactId);
    return d.miembro ? { asignadoA: d.miembro.nombre, tipo: d.porque } : {};
  } catch {
    return {};
  }
}

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  /**
   * Texto libre a propósito: el catálogo se aplica después, con fallback
   * (ver `server/bot/handoff`). Un motivo raro no puede costar el handoff.
   */
  reason: z.string().optional(),
});

/**
 * Handoff pedido por el cerebro externo: pausa la IA y deja la conversación
 * para un humano. Idempotente — solo escribe en la transición, así que
 * reintentar no pisa la hora ni el motivo original.
 *
 * Es la misma pausa que el toggle de la bandeja, y publica el mismo evento,
 * así que la app lo ve en vivo sin refrescar.
 */
export async function POST(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const rows = await db
    .select({
      id: schema.conversation.id,
      handoffAt: schema.conversation.handoffAt,
    })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, body.data.conversationId)
      )
    )
    .limit(1);
  const conv = rows[0];
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");

  if (!conv.handoffAt) {
    await db
      .update(schema.conversation)
      .set({
        aiEnabled: false,
        handoffAt: new Date(),
        handoffReason: toHandoffReason(body.data.reason),
        updatedAt: new Date(),
      })
      .where(eq(schema.conversation.id, conv.id));
    publish(organizationId, {
      type: "conversation.updated",
      data: { conversation: { id: conv.id } },
    });
    // Petrominal — a quién va: su asesor, o el administrador principal si el
    // cliente es nuevo o no tiene asesor. Queda como nota interna en el hilo.
    try {
      const contactId = await contactoDeConversacion(organizationId, conv.id);
      if (contactId) {
        const destino = await destinoDeTransferencia(organizationId, contactId);
        const quien = destino.miembro?.nombre ?? "el equipo";
        const texto =
          destino.porque === "asesor"
            ? `🔔 La IA transfirió esta conversación a ${quien}, asesor asignado del cliente.`
            : `🔔 Cliente nuevo o sin asesor: la IA lo transfirió a ${quien} (administrador principal) para que le asigne un asesor.`;
        await notaDelSistema(organizationId, conv.id, texto);
      }
    } catch (err) {
      console.error("[petrominal] no se pudo anotar la transferencia:", err);
    }
  }
  return Response.json({ ok: true, ...(await destinoParaRespuesta(organizationId, conv.id)) });
}
