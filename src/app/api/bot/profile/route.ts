import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { serializeBotProfile, type BotLlm } from "@/server/bot/profile";
import { fueraDeHorarioAhora, instruccionFueraDeHorario } from "@/server/horario";
import { resolveAiProvider } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

const INSTRUCCION_FICHA = `

Datos del prospecto: pídele, con naturalidad y de a poco (no todo en un mensaje), su nombre, empresa, cargo, ciudad y correo electrónico, y entiende su operación. Guarda cada dato en la ficha del CRM en cuanto lo sepas, usando EXACTAMENTE estas claves (en minúscula, sin tildes): nombre, empresa, nit, cargo, ciudad, correo, telefono, sector, asesores (cuántas personas atienden clientes), canales (WhatsApp, Instagram, Messenger), como_vende (cómo atienden hoy: celulares personales, chat compartido, otro CRM), interes (qué quiere resolver o ver), demo, horario_demo, notas. Un dato por clave; el correo va solo en «correo», nunca dentro de «notas».

Demo: cuando el prospecto quiera una demo, guarda en la ficha demo: «solicitada» y en horario_demo los días y horas que prefiera, confírmale que el equipo de Syrtel Solutions lo contactará para agendarla y pasa la conversación a una persona con el motivo «demo». No agendes tú la fecha ni confirmes una hora.`;

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
  const conFicha = {
    ...conHorario,
    instructions: (conHorario.instructions ?? "") + INSTRUCCION_FICHA,
  };

  return Response.json(serializeBotProfile(conFicha, kb, llm));
}
