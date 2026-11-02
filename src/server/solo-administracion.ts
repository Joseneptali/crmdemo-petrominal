import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";

/**
 * Petrominal — pantallas de la administración (Ajustes, Agente, Laboratorio,
 * Guía de inicio, Resultados): un asesor que llegue por la URL vuelve a la
 * Bandeja.
 */
export async function soloAdministracion(): Promise<void> {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canConfigure(session.role)) redirect("/inbox");
}
