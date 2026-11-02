import { withAuth } from "@/lib/api";
import { veTodo } from "@/lib/asesores";
import { generarInforme } from "@/server/informes";
import { rangoDe } from "@/server/informes/rango";

export const dynamic = "force-dynamic";

/** Petrominal — informe gerencial (solo administración). */
export const GET = withAuth(async (session, req: Request) => {
  // Petrominal — un asesor ve solo sus ventas.
  const asesor = veTodo(session.role) ? undefined : session.userId;
  const { desde, hasta } = rangoDe(new URL(req.url));
  return Response.json({ informe: await generarInforme(session.organizationId, desde, hasta, asesor) });
});
