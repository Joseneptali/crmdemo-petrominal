import { CotizacionesClient } from "@/components/cotizaciones/cotizaciones-client";

export const dynamic = "force-dynamic";

/** Petrominal — cotizaciones. `?contacto=ct_…` crea una nueva para ese cliente. */
export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ contacto?: string }>;
}) {
  const { contacto } = await searchParams;
  return <CotizacionesClient contactoInicial={contacto} />;
}
