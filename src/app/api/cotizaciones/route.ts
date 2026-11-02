import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { CotizacionError, crearCotizacion, listarCotizaciones } from "@/server/cotizaciones";

export const dynamic = "force-dynamic";

/** Petrominal — cotizaciones (un asesor ve las de su cartera). `?contacto=` filtra. */
export const GET = withAuth(async (session, req: Request) => {
  const contacto = new URL(req.url).searchParams.get("contacto") ?? undefined;
  return Response.json({ cotizaciones: await listarCotizaciones(session, contacto) });
});

const crearSchema = z.object({ contactId: z.string().min(1) });

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, crearSchema);
  if (!body.ok) return body.response;
  try {
    const id = await crearCotizacion(session, body.data.contactId);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof CotizacionError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
