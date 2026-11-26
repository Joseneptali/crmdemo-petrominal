import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { disponibilidad } from "@/server/clinica";

export const dynamic = "force-dynamic";

/** Demo clínica — huecos libres de una especialidad para un paciente (con el tope de su contrato). */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const especialidadId = url.searchParams.get("especialidadId");
  const pacienteId = url.searchParams.get("pacienteId");
  const excluirCitaId = url.searchParams.get("excluirCitaId") ?? undefined;
  const procedimientoId = url.searchParams.get("procedimientoId");
  if (!especialidadId) return apiError(422, "invalid_body", "Falta especialidadId");
  let epsId: string | null = null;
  if (pacienteId) {
    const [p] = await getDb()
      .select({ epsId: schema.clinicaPaciente.epsId })
      .from(schema.clinicaPaciente)
      .where(scoped(schema.clinicaPaciente.organizationId, session.organizationId, eq(schema.clinicaPaciente.id, pacienteId)))
      .limit(1);
    epsId = p?.epsId ?? null;
  }
  const r = await disponibilidad(session.organizationId, { especialidadId, procedimientoId, pacienteId, epsId, excluirCitaId });
  return Response.json({ huecos: r.huecos.slice(0, 60), valor: r.valor, topeLleno: r.topeLleno, contratoId: r.contratoId });
});
