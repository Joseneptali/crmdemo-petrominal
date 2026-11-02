import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { veTodo } from "@/lib/asesores";
import { guardarAjustesCliente, leerAjustesCliente } from "@/server/asesores";

export const dynamic = "force-dynamic";

/** Petrominal — qué ve el cliente del asesor: firma y presentación. */
export const GET = withAuth(async (session) => {
  return Response.json({ ajustes: await leerAjustesCliente(session.organizationId) });
});

const schema = z.object({ firmarMensajes: z.boolean(), presentarAsesor: z.boolean() });

export const PUT = withAuth(async (session, req: Request) => {
  if (!veTodo(session.role)) return apiError(403, "forbidden", "Solo la administración");
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  await guardarAjustesCliente(session.organizationId, body.data);
  return Response.json({ ajustes: body.data });
});
