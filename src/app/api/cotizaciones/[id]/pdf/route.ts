import { apiError, withAuth } from "@/lib/api";
import { numeroCotizacion } from "@/lib/cotizaciones";
import { CotizacionError, obtenerCotizacion } from "@/server/cotizaciones";
import { generarPdfCotizacion } from "@/server/cotizaciones/pdf";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** El PDF para ver o descargar (con sesión). Muestra también los borradores. */
export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    const dto = await obtenerCotizacion(session, id);
    const pdf = await generarPdfCotizacion(session.organizationId, dto);
    const descargar = new URL(req.url).searchParams.get("descargar") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${descargar ? "attachment" : "inline"}; filename="Cotizacion-Petrominal-${numeroCotizacion(dto.numero)}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof CotizacionError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
