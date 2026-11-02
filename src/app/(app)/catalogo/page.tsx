import { CatalogoClient } from "@/components/catalogo/catalogo-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { PaginaConScroll } from "@/components/pagina-con-scroll";

export const dynamic = "force-dynamic";

/** Petrominal — catálogo de productos del cotizador. */
export default async function CatalogoPage() {
  const session = await getSessionOrNull();
  return (
    <PaginaConScroll>
      <CatalogoClient puedeImportar={canConfigure(session?.role)} />
    </PaginaConScroll>
  );
}
