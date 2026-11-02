import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { importarSemilla } from "@/server/catalogo";

export const dynamic = "force-dynamic";

/** Carga el inventario de Siigo de Petrominal (idempotente). Solo administración. */
export const POST = withAuth(async (session) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo la administración carga el catálogo");
  }
  const r = await importarSemilla(session.organizationId);
  return Response.json(r);
});
