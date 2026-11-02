import { headers } from "next/headers";
import { CuentaClient } from "@/components/cuenta/cuenta-client";
import { PaginaConScroll } from "@/components/pagina-con-scroll";
import { getAuth } from "@/lib/auth";
import { getSessionOrNull } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Petrominal — Mi cuenta (todos los usuarios). */
export default async function CuentaPage() {
  const session = await getSessionOrNull();
  const auth = await getAuth().api.getSession({ headers: await headers() });
  return (
    <PaginaConScroll>
      <CuentaClient nombre={auth?.user.name ?? ""} correo={auth?.user.email ?? ""} rol={session?.role ?? "member"} />
    </PaginaConScroll>
  );
}
