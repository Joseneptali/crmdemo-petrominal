import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { CotizacionError, obtenerCotizacion } from "@/server/cotizaciones";
import { enviarPorCorreo, enviarPorWhatsapp } from "@/server/cotizaciones/enviar";
import { CorreoError } from "@/server/correo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  canal: z.enum(["whatsapp", "correo"]),
  para: z.string().trim().email("Correo del cliente inválido").optional(),
  mensaje: z.string().max(4000).optional(),
});

/** Enviar la cotización al cliente. Bloquea si falta alguna foto o precio. */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  try {
    if (body.data.canal === "whatsapp") {
      await enviarPorWhatsapp(session, id, body.data.mensaje);
    } else {
      if (!body.data.para) return apiError(422, "para", "Escribe el correo del cliente");
      await enviarPorCorreo(session, id, body.data.para, body.data.mensaje);
    }
    return Response.json({ cotizacion: await obtenerCotizacion(session, id) });
  } catch (err) {
    if (err instanceof CotizacionError || err instanceof CorreoError) {
      return apiError(err.status, err.code, err.message);
    }
    throw err;
  }
});
