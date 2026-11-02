import { apiError, withAuth } from "@/lib/api";
import { FOTO_MAX_BYTES } from "@/lib/catalogo";
import { CatalogoError, guardarFoto, leerFoto } from "@/server/catalogo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** La foto del producto (solo con sesión). */
export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const foto = await leerFoto(session.organizationId, id);
  if (!foto) return apiError(404, "not_found", "Este producto no tiene foto");
  const cacheable = new URL(req.url).searchParams.has("v");
  return new Response(new Uint8Array(foto.data), {
    headers: {
      "content-type": foto.mime,
      "x-content-type-options": "nosniff",
      "cache-control": cacheable ? "private, max-age=31536000, immutable" : "private, max-age=60",
    },
  });
});

/** Subir o cambiar la foto (multipart, campo `foto`): cualquier asesor. */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("foto");
  if (!archivo || typeof archivo === "string") {
    return apiError(422, "invalid", "Falta la imagen (campo «foto»)");
  }
  if (archivo.size > FOTO_MAX_BYTES) {
    return apiError(413, "muy_grande", "La imagen pesa más de 5 MB");
  }
  try {
    const producto = await guardarFoto(
      session.organizationId,
      id,
      Buffer.from(await archivo.arrayBuffer())
    );
    return Response.json({ producto });
  } catch (err) {
    if (err instanceof CatalogoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
