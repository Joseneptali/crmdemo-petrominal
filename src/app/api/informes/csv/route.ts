import { apiError, withAuth } from "@/lib/api";
import { veTodo } from "@/lib/asesores";
import { exportarCsv } from "@/server/informes";
import { rangoDe } from "@/server/informes/rango";

export const dynamic = "force-dynamic";

const TIPOS = ["leads", "cotizaciones", "reuniones"] as const;

/** Petrominal — exportar a Excel (CSV con punto y coma). */
export const GET = withAuth(async (session, req: Request) => {
  const asesor = veTodo(session.role) ? undefined : session.userId;
  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo") as (typeof TIPOS)[number];
  if (!TIPOS.includes(tipo)) return apiError(422, "tipo", "Tipo de exportación inválido");
  const { desde, hasta } = rangoDe(url);
  const cuerpo = await exportarCsv(session.organizationId, tipo, desde, hasta, asesor);
  return new Response(cuerpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="petrominal-${tipo}.csv"`,
      "cache-control": "private, no-store",
    },
  });
});
