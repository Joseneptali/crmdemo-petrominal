import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { cambiarEstado, ReunionError } from "@/server/reuniones";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ estado: z.enum(["realizada", "cancelada"]), avisar: z.boolean().optional() });

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ reunion: await cambiarEstado(session, id, body.data.estado, body.data.avisar ?? true) });
  } catch (err) {
    if (err instanceof ReunionError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
