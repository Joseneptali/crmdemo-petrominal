import { apiError, parseBody, withAuth } from "@/lib/api";
import { veTodo } from "@/lib/asesores";
import { guardarHorario, horarioSchema, leerHorario } from "@/server/horario";

export const dynamic = "force-dynamic";

/** Petrominal — horario de atención (lo ve el equipo; lo cambia la administración). */
export const GET = withAuth(async (session) => {
  return Response.json({ horario: await leerHorario(session.organizationId), puedeEditar: veTodo(session.role) });
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!veTodo(session.role)) return apiError(403, "forbidden", "Solo la administración cambia el horario");
  const body = await parseBody(req, horarioSchema);
  if (!body.ok) return body.response;
  return Response.json({ horario: await guardarHorario(session.organizationId, body.data) });
});
