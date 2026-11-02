import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { enlaceValido } from "@/server/enlace-publico";
import { readMediaFile } from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ assetId: string }> };

/**
 * Petrominal — un adjunto saliente servido por enlace firmado, SIN sesión: así
 * Zernio puede descargarlo para mandarlo por WhatsApp. Sin firma válida → 404.
 */
export async function GET(req: Request, ctx: Params) {
  const { assetId } = await ctx.params;
  if (!/^[\w.-]{1,64}$/.test(assetId) || !enlaceValido(`media:${assetId}`, new URL(req.url))) {
    return new Response(null, { status: 404 });
  }
  const [asset] = await getDb()
    .select()
    .from(schema.mediaAsset)
    .where(eq(schema.mediaAsset.id, assetId))
    .limit(1);
  if (!asset || asset.fetchStatus !== "available") return new Response(null, { status: 404 });
  try {
    const data = await readMediaFile(asset.organizationId, assetId);
    const nombre = (asset.fileName ?? assetId).replace(/[^\w.\- ]/g, "_");
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": asset.mimeType ?? "application/octet-stream",
        "content-disposition": `inline; filename="${nombre}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
