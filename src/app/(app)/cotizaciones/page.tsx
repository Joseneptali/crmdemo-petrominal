import { CotizacionesClient } from "@/components/cotizaciones/cotizaciones-client";
import { PaginaConScroll } from "@/components/pagina-con-scroll";

export const dynamic = "force-dynamic";

/** Petrominal — cotizaciones. `?contacto=ct_…` crea una nueva para ese cliente. */
export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ contacto?: string }>;
}) {
  const { contacto } = await searchParams;
  return (
    <PaginaConScroll>
      <CotizacionesClient contactoInicial={contacto} />
    </PaginaConScroll>
  );
}
