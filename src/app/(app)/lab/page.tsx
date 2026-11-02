import { LabClient } from "@/components/lab/lab-client";
import { soloAdministracion } from "@/server/solo-administracion";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  // Petrominal — solo la administración.
  await soloAdministracion();
  return <LabClient />;
}
