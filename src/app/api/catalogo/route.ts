import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  CatalogoError,
  crearProducto,
  filtroSchema,
  listarProductos,
  productoSchema,
  resumenCatalogo,
} from "@/server/catalogo";

export const dynamic = "force-dynamic";

/** Petrominal — busca en el catálogo. `?resumen=1` añade totales y líneas. */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const filtro = filtroSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!filtro.success) return apiError(422, "invalid", "Filtro inválido");
  const pagina = await listarProductos(session.organizationId, filtro.data);
  const resumen = url.searchParams.get("resumen") === "1"
    ? await resumenCatalogo(session.organizationId)
    : undefined;
  return Response.json({ ...pagina, resumen });
});

/** Crear un producto: cualquier asesor (queda guardado en el catálogo). */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, productoSchema);
  if (!body.ok) return body.response;
  try {
    const producto = await crearProducto(session.organizationId, session.userId, body.data);
    return Response.json({ producto }, { status: 201 });
  } catch (err) {
    if (err instanceof CatalogoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
