import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { upsertFicha } from "@/server/bot/ficha";
import { pidePrueba, yaSalio } from "@/lib/cotizacion-prueba";
import { modoSyrtel } from "@/server/modo";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  // Objeto libre a propósito: las claves las define el negocio, y el servidor
  // tolera el drift del LLM en vez de castigarlo con un 422 (ver server/bot/ficha).
  ficha: z.record(z.string(), z.unknown()),
});

/**
 * Ficha de calificación del lead, escrita por un cerebro externo.
 * Merge campo a campo contra lo que ya había; `null` explícito borra la clave.
 * Devuelve la ficha COMPLETA resultante, no solo el parche, para que el bot no
 * tenga que llevar su propia copia sincronizada.
 */
export async function PUT(req: Request) {
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
    .select({ contactId: schema.conversation.contactId })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, body.data.conversationId)
      )
    )
    .limit(1);
  if (!rows[0]) return apiError(404, "not_found", "Conversación no encontrada");

  // Syrtel — la cotización de prueba sale una sola vez: si ya salió, la IA no
  // puede volver a pedirla pisando ese estado.
  const [previa] = await db
    .select({ ficha: schema.contact.ficha })
    .from(schema.contact)
    .where(eq(schema.contact.id, rows[0].contactId))
    .limit(1);
  const antes = (previa?.ficha ?? {}) as Record<string, unknown>;
  const parche = { ...body.data.ficha };
  const pidio = modoSyrtel() && "cotizacion_prueba" in parche && pidePrueba(parche.cotizacion_prueba) && !yaSalio(antes.cotizacion_prueba);
  if ("cotizacion_prueba" in parche && yaSalio(antes.cotizacion_prueba)) delete parche.cotizacion_prueba;
  if (pidio) parche.cotizacion_prueba = "enviando";

  const result = await upsertFicha({
    organizationId,
    contactId: rows[0].contactId,
    ficha: parche,
  });
  if (!result) return apiError(404, "not_found", "Contacto no encontrado");
  if (pidio) {
    // En segundo plano: la IA no espera el PDF ni el correo para responder.
    const conversationId = body.data.conversationId;
    void import("@/server/cotizacion-prueba")
      .then((m) => m.enviarCotizacionPrueba(organizationId, conversationId))
      .catch((err) => console.error("[syrtel] cotización de prueba falló:", err));
  }
  return Response.json(result);
}
