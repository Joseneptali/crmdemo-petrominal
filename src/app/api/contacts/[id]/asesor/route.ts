import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { veTodo } from "@/lib/asesores";
import { AsesorError, asignarAsesor } from "@/server/asesores";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ asesorUserId: z.string().min(1).nullable() });

/** Petrominal — asignar (o quitar) el asesor de un cliente. Solo administración. */
export const PUT = withAuth(async (session, req: Request, ctx: Params) => {
  if (!veTodo(session.role)) {
    return apiError(403, "forbidden", "Solo la administración asigna asesores");
  }
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  try {
    const asesor = await asignarAsesor(session.organizationId, id, body.data.asesorUserId);
    return Response.json({ asesor });
  } catch (err) {
    if (err instanceof AsesorError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
