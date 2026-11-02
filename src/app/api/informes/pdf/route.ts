import { apiError, withAuth } from "@/lib/api";
import { veTodo } from "@/lib/asesores";
import { generarInforme } from "@/server/informes";
import { generarPdfInforme } from "@/server/informes/pdf";
import { rangoDe } from "@/server/informes/rango";

export const dynamic = "force-dynamic";

/** Petrominal — informe gerencial en PDF. */
export const GET = withAuth(async (session, req: Request) => {
  if (!veTodo(session.role)) return apiError(403, "forbidden", "Los informes son de la administración");
  const { desde, hasta } = rangoDe(new URL(req.url));
  const pdf = await generarPdfInforme(await generarInforme(session.organizationId, desde, hasta));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="informe-gerencial-petrominal.pdf"`,
      "cache-control": "private, no-store",
    },
  });
});
