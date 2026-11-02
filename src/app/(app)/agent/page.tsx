import { AgentClient } from "@/components/agent/agent-client";
import { soloAdministracion } from "@/server/solo-administracion";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  // Petrominal — solo la administración.
  await soloAdministracion();
  return <AgentClient />;
}
