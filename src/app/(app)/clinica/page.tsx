import { ClinicaClient } from "@/components/clinica/clinica-client";
import { PaginaConScroll } from "@/components/pagina-con-scroll";

export const dynamic = "force-dynamic";

/** Demo clínica oftalmológica: agenda, contratos con EPS, pacientes y profesionales. */
export default function ClinicaPage() {
  return (
    <PaginaConScroll>
      <ClinicaClient />
    </PaginaConScroll>
  );
}
