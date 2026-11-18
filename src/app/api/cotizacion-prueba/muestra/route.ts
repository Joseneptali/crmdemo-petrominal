import { apiError, withAuth } from "@/lib/api";
import { veTodo } from "@/lib/asesores";
import { nichoDe, plantillaPrueba } from "@/lib/cotizacion-prueba";
import { generarPdfPrueba } from "@/server/cotizacion-prueba/pdf";

export const dynamic = "force-dynamic";

/**
 * Syrtel — vista previa de la cotización de prueba que envía la IA
 * (`?nicho=clinica|colegio|contable|servicios|comercio`). Solo administración.
 */
export const GET = withAuth(async (session, req: Request) => {
  if (!veTodo(session.role)) return apiError(403, "forbidden", "Solo la administración");
  const nicho = nichoDe(new URL(req.url).searchParams.get("nicho"));
  const pdf = await generarPdfPrueba({
    numero: "EJ-MUESTRA",
    fecha: new Date(),
    cliente: { nombre: "Nombre del prospecto", empresa: "Empresa del prospecto", correo: "correo@empresa.com" },
    plantilla: plantillaPrueba(nicho),
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Cotizacion-ejemplo-${nicho}.pdf"`,
      "cache-control": "no-store",
    },
  });
});
