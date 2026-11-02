import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  CotizacionError,
  guardarCotizacion,
  guardarSchema,
  obtenerCotizacion,
} from "@/server/cotizaciones";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    return Response.json({ cotizacion: await obtenerCotizacion(session, id) });
  } catch (err) {
    if (err instanceof CotizacionError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Guardar los renglones y condiciones (los renglones se reemplazan completos). */
export const PUT = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, guardarSchema);
  if (!body.ok) return body.response;
  try {
    await guardarCotizacion(session, id, body.data);
    return Response.json({ cotizacion: await obtenerCotizacion(session, id) });
  } catch (err) {
    if (err instanceof CotizacionError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
