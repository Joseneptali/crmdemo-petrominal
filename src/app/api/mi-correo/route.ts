import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  borrarMiCorreo,
  correoSchema,
  CorreoError,
  guardarMiCorreo,
  miCorreo,
  YAHOO_SMALL_BUSINESS,
} from "@/server/correo";

export const dynamic = "force-dynamic";

/** Petrominal — el correo de envío de quien está en sesión (la clave nunca sale). */
export const GET = withAuth(async (session) => {
  return Response.json({
    correo: await miCorreo(session.organizationId, session.userId),
    sugerido: YAHOO_SMALL_BUSINESS,
  });
});

/** Guarda y comprueba contra el servidor SMTP antes de aceptar. */
export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, correoSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ correo: await guardarMiCorreo(session.organizationId, session.userId, body.data) });
  } catch (err) {
    if (err instanceof CorreoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

export const DELETE = withAuth(async (session) => {
  await borrarMiCorreo(session.organizationId, session.userId);
  return Response.json({ ok: true });
});
