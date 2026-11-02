import { withAuth } from "@/lib/api";
import { veTodo } from "@/lib/asesores";
import { generarInforme } from "@/server/informes";
import { generarPdfInforme } from "@/server/informes/pdf";
import { rangoDe } from "@/server/informes/rango";

export const dynamic = "force-dynamic";

/** Petrominal — informe gerencial en PDF. */
export const GET = withAuth(async (session, req: Request) => {
  const asesor = veTodo(session.role) ? undefined : session.userId;
  const { desde, hasta } = rangoDe(new URL(req.url));
  const pdf = await generarPdfInforme(await generarInforme(session.organizationId, desde, hasta, asesor));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="informe-gerencial-petrominal.pdf"`,
      "cache-control": "private, no-store",
    },
  });
});
