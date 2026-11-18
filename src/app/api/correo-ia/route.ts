import { apiError, parseBody, withAuth } from "@/lib/api";
import { veTodo } from "@/lib/asesores";
import { borrarMiCorreo, correoSchema, CorreoError, guardarMiCorreo, miCorreo } from "@/server/correo";

export const dynamic = "force-dynamic";

/**
 * Syrtel — el correo de la IA: el buzón desde el que el asesor virtual envía
 * las cotizaciones de ejemplo. Uno por negocio; lo configura la administración.
 * La clave nunca sale del CRM.
 */
export const GET = withAuth(async (session) => {
  if (!veTodo(session.role)) return apiError(403, "forbidden", "Solo la administración");
  return Response.json({ correo: await miCorreo(session.organizationId, null) });
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!veTodo(session.role)) return apiError(403, "forbidden", "Solo la administración");
  const body = await parseBody(req, correoSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ correo: await guardarMiCorreo(session.organizationId, null, body.data) });
  } catch (err) {
    if (err instanceof CorreoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

export const DELETE = withAuth(async (session) => {
  if (!veTodo(session.role)) return apiError(403, "forbidden", "Solo la administración");
  await borrarMiCorreo(session.organizationId, null);
  return Response.json({ ok: true });
});
