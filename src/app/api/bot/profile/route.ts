import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { serializeBotProfile, type BotLlm } from "@/server/bot/profile";
import { fueraDeHorarioAhora, instruccionFueraDeHorario } from "@/server/horario";
import { resolveAiProvider } from "@/lib/ai/provider";
import { clinicaActiva } from "@/server/clinica";
import { instruccionesClinica } from "@/server/clinica/instrucciones";

export const dynamic = "force-dynamic";

const INSTRUCCION_FICHA = `

Ficha del prospecto: anota en la ficha del CRM lo que vayas sabiendo, sin interrogar (un dato por mensaje y solo cuando venga al caso), usando EXACTAMENTE estas claves en minúscula y sin tildes: nombre, cargo, empresa, nit, ciudad, correo, telefono, nicho (tipo de negocio), tamano (cuántas personas atienden clientes), volumen (mensajes o citas por día o semana), canales (WhatsApp, Instagram, Messenger, correo), como_vende (cómo atienden hoy), dolor (el problema principal, en sus palabras), integraciones (Google, Microsoft 365, Zoho, Siigo, Excel u otra), decisor (quién decide), urgencia (para cuándo lo necesita), demo, horario_demo, notas. Un dato por clave; el correo va solo en «correo».

Cotización de prueba: cuando el prospecto muestre interés en cotizaciones (o quiera ver algo concreto), ofrécele una cotización de ejemplo de su tipo de negocio. Si acepta, asegúrate de tener su nombre, su correo y su nicho en la ficha y guarda cotizacion_prueba: «solicitada». El CRM la arma y se la envía por WhatsApp y por correo en unos segundos; dile que ya va en camino. Es un ejemplo con productos ficticios: nunca lleva el precio de Syrtel CRM. Sale una sola vez por prospecto; si pide otra, ofrécele la demo.

Autonomía y demo: atiendes TODA la conversación tú solo, sin pasarla a una persona, hasta que el prospecto quiera definitivamente la demo. Entonces guarda demo: «solicitada» y en horario_demo los días y horas que prefiera, confírmale que el equipo de Syrtel Solutions lo contactará para agendarla y pasa la conversación a una persona con el motivo «demo». No confirmes tú una fecha ni una hora. La única otra razón para pasarla antes es que pida expresamente hablar con una persona.`;

/**
 * Perfil del agente + knowledge base para un cerebro externo.
 * GET /api/bot/profile → {profile, kb, resources}. Sin caché: cada consulta
 * refleja lo que el dueño dejó en la UI al momento (el TTL vive del lado del
 * bot, que es quien sabe cada cuánto le conviene releer).
 */
export async function GET(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const db = getDb();
  const profiles = await db
    .select()
    .from(schema.agentProfile)
    .where(eq(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  const profile = profiles[0];
  if (!profile) {
    // Condición esperada (instancia sin perfil): el bot cae a su brief local.
    return apiError(404, "no_profile", "La instancia no tiene perfil de agente");
  }

  const kb = await db
    .select()
    .from(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId))
    .orderBy(asc(schema.kbEntry.createdAt));

  // 036 — Con qué piensa el cerebro que no trae llave: el proxy del CRM.
  const ia = await resolveAiProvider(organizationId);
  const llm: BotLlm = ia.ok && ia.provider.model ? { path: "/api/bot/llm", model: ia.provider.model } : null;

  // Petrominal — el horario de atención llega en las instrucciones: fuera de
  // horario la IA atiende y toma datos, pero no transfiere.
  const { fuera, ajustes } = await fueraDeHorarioAhora(organizationId).catch(() => ({
    fuera: false,
    ajustes: null,
  }));
  const conHorario =
    ajustes?.activo
      ? {
          ...profile,
          instructions:
            (profile.instructions ?? "") +
            `\n\nHorario de atención de los asesores: ${ajustes.descripcion} (hora de Colombia).` +
            (fuera && ajustes.modo === "ia" ? instruccionFueraDeHorario(ajustes) : ""),
        }
      : profile;

  // Petrominal — la ficha del cliente con claves fijas: así la cotización y
  // las reuniones encuentran el correo, la empresa, el NIT y la ciudad.
  // Demo clínica: en vez del guion de ventas de Syrtel, cómo se agenda en la clínica.
  const clinica = await clinicaActiva(organizationId);
  const conFicha = {
    ...conHorario,
    instructions: (conHorario.instructions ?? "") + (clinica ? await instruccionesClinica(organizationId) : INSTRUCCION_FICHA),
  };

  return Response.json(serializeBotProfile(conFicha, kb, llm));
}
