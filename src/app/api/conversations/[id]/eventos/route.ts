import { apiError, withAuth } from "@/lib/api";
import { eventosDeConversacion } from "@/server/inbox/eventos";
import { puedeVerConversacion } from "@/server/asesores";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 054 — Los eventos del hilo (etapas y traspaso), por hora. Ajena: 404. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  // Petrominal — un asesor solo abre las conversaciones de su cartera.
  if (!(await puedeVerConversacion(session, id))) return apiError(404, "not_found", "Conversación no encontrada");
  const eventos = await eventosDeConversacion(session.organizationId, id);
  if (!eventos) return apiError(404, "not_found", "Conversación no encontrada");
  return Response.json({ eventos });
});
