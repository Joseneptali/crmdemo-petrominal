import { ReunionesClient } from "@/components/reuniones/reuniones-client";

export const dynamic = "force-dynamic";

/** Petrominal — reuniones. `?contacto=ct_…` abre el formulario con ese cliente. */
export default async function ReunionesPage({
  searchParams,
}: {
  searchParams: Promise<{ contacto?: string }>;
}) {
  const { contacto } = await searchParams;
  return <ReunionesClient contactoInicial={contacto} />;
}
