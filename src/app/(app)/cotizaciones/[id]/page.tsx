import { EditorCotizacion } from "@/components/cotizaciones/editor-cotizacion";

export const dynamic = "force-dynamic";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorCotizacion id={id} />;
}
