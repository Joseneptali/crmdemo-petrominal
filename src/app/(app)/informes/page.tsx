import { InformesClient } from "@/components/informes/informes-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { veTodo } from "@/lib/asesores";

export const dynamic = "force-dynamic";

/** Petrominal — informes gerenciales (solo administración). */
export default async function InformesPage() {
  const session = await getSessionOrNull();
  if (!veTodo(session?.role)) {
    return <p className="text-sm text-text-2">Los informes son de la administración.</p>;
  }
  return <InformesClient />;
}
