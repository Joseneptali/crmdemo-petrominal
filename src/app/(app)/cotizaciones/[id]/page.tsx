import { EditorCotizacion } from "@/components/cotizaciones/editor-cotizacion";
import { PaginaConScroll } from "@/components/pagina-con-scroll";

export const dynamic = "force-dynamic";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PaginaConScroll>
      <EditorCotizacion id={id} />
    </PaginaConScroll>
  );
}
