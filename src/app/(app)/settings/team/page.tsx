import { AdminPrincipalCard } from "@/components/asesores/admin-principal-card";
import { TeamClient } from "@/components/settings/team-client";

export const dynamic = "force-dynamic";

export default function TeamSettingsPage() {
  return (
    <div className="space-y-6">
      {/* Petrominal — quién recibe los clientes nuevos o sin asesor. */}
      <AdminPrincipalCard />
      <TeamClient />
    </div>
  );
}
