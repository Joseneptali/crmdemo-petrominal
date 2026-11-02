import { ReunionesClient } from "@/components/reuniones/reuniones-client";
import { PaginaConScroll } from "@/components/pagina-con-scroll";

export const dynamic = "force-dynamic";

/** Petrominal — reuniones. `?contacto=ct_…` abre el formulario con ese cliente. */
export default async function ReunionesPage({
  searchParams,
}: {
  searchParams: Promise<{ contacto?: string }>;
}) {
  const { contacto } = await searchParams;
  return (
    <PaginaConScroll>
      <ReunionesClient contactoInicial={contacto} />
    </PaginaConScroll>
  );
}
