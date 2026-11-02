import { InformesClient } from "@/components/informes/informes-client";
import { PaginaConScroll } from "@/components/pagina-con-scroll";
import { getSessionOrNull } from "@/lib/auth/session";
import { veTodo } from "@/lib/asesores";

export const dynamic = "force-dynamic";

/** Petrominal — informes: la administración ve todo; un asesor, sus ventas. */
export default async function InformesPage() {
  const session = await getSessionOrNull();
  return (
    <PaginaConScroll>
      <InformesClient administracion={veTodo(session?.role)} />
    </PaginaConScroll>
  );
}
