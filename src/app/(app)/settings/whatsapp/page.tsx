import { WhatsappWizard } from "@/components/settings/whatsapp-wizard";
import { ZernioWhatsappCard } from "@/components/settings/zernio-whatsapp-card";

export const dynamic = "force-dynamic";

export default function WhatsappSettingsPage() {
  return (
    <div className="space-y-6">
      {/* Petrominal — conexión por Zernio, para quien aún no es Tech Provider. */}
      <ZernioWhatsappCard />
      <WhatsappWizard />
    </div>
  );
}
