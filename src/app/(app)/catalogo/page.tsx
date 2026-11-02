import { CatalogoClient } from "@/components/catalogo/catalogo-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/** Petrominal — catálogo de productos del cotizador. */
export default async function CatalogoPage() {
  const session = await getSessionOrNull();
  return <CatalogoClient puedeImportar={canConfigure(session?.role)} />;
}
