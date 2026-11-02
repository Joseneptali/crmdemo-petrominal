import { apiError, parseBody, withAuth } from "@/lib/api";
import { actualizarProducto, CatalogoError, productoParcialSchema } from "@/server/catalogo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Editar los datos de un producto: cualquier asesor. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, productoParcialSchema);
  if (!body.ok) return body.response;
  try {
    const producto = await actualizarProducto(session.organizationId, id, body.data);
    return Response.json({ producto });
  } catch (err) {
    if (err instanceof CatalogoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
