import { apiError, parseBody, withAuth } from "@/lib/api";
import { crearReunion, crearSchema, listarReuniones, ReunionError } from "@/server/reuniones";

export const dynamic = "force-dynamic";

/** Petrominal — reuniones (un asesor ve las suyas; la administración, todas). */
export const GET = withAuth(async (session) => {
  return Response.json({ reuniones: await listarReuniones(session) });
});

/** Programar: guarda y envía la invitación por los canales elegidos. */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, crearSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ reunion: await crearReunion(session, body.data) }, { status: 201 });
  } catch (err) {
    if (err instanceof ReunionError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
