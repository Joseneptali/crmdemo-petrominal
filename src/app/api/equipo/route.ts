import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { veTodo, type EquipoDto } from "@/lib/asesores";
import {
  adminPrincipal,
  AsesorError,
  fijarAdminPrincipal,
  listarMiembros,
} from "@/server/asesores";

export const dynamic = "force-dynamic";

/** Petrominal — el equipo comercial y quién recibe los clientes nuevos. */
export const GET = withAuth(async (session) => {
  const dto: EquipoDto = {
    miembros: await listarMiembros(session.organizationId),
    adminPrincipal: await adminPrincipal(session.organizationId),
    puedeAsignar: veTodo(session.role),
  };
  return Response.json(dto);
});

const putSchema = z.object({ adminPrincipalUserId: z.string().min(1) });

/** Cambiar el administrador principal. Solo el propietario. */
export const PUT = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario cambia el administrador principal");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  try {
    await fijarAdminPrincipal(session.organizationId, body.data.adminPrincipalUserId);
    return Response.json({ adminPrincipal: await adminPrincipal(session.organizationId) });
  } catch (err) {
    if (err instanceof AsesorError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
