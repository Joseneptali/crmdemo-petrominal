import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  dentroDeHorario,
  describirHorario,
  HORARIO_POR_DEFECTO,
  MENSAJE_POR_DEFECTO,
  type Horario,
} from "@/lib/horario";
import { destinoDeTransferencia, notaDelSistema } from "@/server/asesores";

/**
 * Petrominal — horario de atención. Fuera de horario, según el modo:
 * - `mensaje`: el CRM responde el horario (una vez por cierre) y la IA no contesta.
 * - `ia`: la IA atiende y toma los datos; el CRM deja una nota para el asesor
 *   del cliente o, si es nuevo, para el administrador principal.
 */

export type AjustesHorario = {
  activo: boolean;
  modo: "mensaje" | "ia";
  horario: Horario;
  mensaje: string;
  descripcion: string;
};

const tramo = z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]);

export const horarioSchema = z.object({
  activo: z.boolean(),
  modo: z.enum(["mensaje", "ia"]),
  horario: z.partialRecord(z.enum(["1", "2", "3", "4", "5", "6", "7"]), tramo),
  mensaje: z.string().trim().max(1000).nullable().optional(),
});

/** Un cierre: no se repite aviso ni nota más de una vez cada 10 horas. */
const ENTRE_AVISOS_MS = 10 * 60 * 60 * 1000;

export async function leerHorario(organizationId: string): Promise<AjustesHorario> {
  const [aj] = await getDb()
    .select()
    .from(schema.petrominalAjustes)
    .where(scoped(schema.petrominalAjustes.organizationId, organizationId))
    .limit(1);
  const horario = (aj?.horario as Horario | null) ?? HORARIO_POR_DEFECTO;
  return {
    activo: aj?.horarioActivo ?? false,
    modo: aj?.horarioModo ?? "ia",
    horario,
    mensaje: aj?.mensajeFueraHorario?.trim() || MENSAJE_POR_DEFECTO,
    descripcion: describirHorario(horario),
  };
}

export async function guardarHorario(
  organizationId: string,
  datos: z.infer<typeof horarioSchema>
): Promise<AjustesHorario> {
  const db = getDb();
  const valores = {
    horarioActivo: datos.activo,
    horarioModo: datos.modo,
    horario: datos.horario as Horario,
    mensajeFueraHorario: datos.mensaje?.trim() || null,
    updatedAt: new Date(),
  };
  const [aj] = await db
    .select({ id: schema.petrominalAjustes.id })
    .from(schema.petrominalAjustes)
    .where(scoped(schema.petrominalAjustes.organizationId, organizationId))
    .limit(1);
  if (aj) await db.update(schema.petrominalAjustes).set(valores).where(eq(schema.petrominalAjustes.id, aj.id));
  else await db.insert(schema.petrominalAjustes).values({ id: newId("petrominalAjustes"), organizationId, ...valores });
  return leerHorario(organizationId);
}

/** ¿Fuera de horario ahora mismo? (con el horario encendido). */
export async function fueraDeHorarioAhora(
  organizationId: string
): Promise<{ fuera: boolean; ajustes: AjustesHorario }> {
  const ajustes = await leerHorario(organizationId);
  return { fuera: ajustes.activo && !dentroDeHorario(ajustes.horario, new Date()), ajustes };
}

/**
 * Lo que hace el CRM con un mensaje entrante según el horario. Devuelve si
 * hay que despacharlo a la IA. Nunca lanza: ante un error, se atiende normal.
 */
export async function revisarHorario(
  organizationId: string,
  conversationId: string,
  contactId: string,
  enviarTexto: (texto: string) => Promise<void>
): Promise<{ despachar: boolean }> {
  try {
    const { fuera, ajustes } = await fueraDeHorarioAhora(organizationId);
    if (!fuera) return { despachar: true };

    const db = getDb();
    const [conv] = await db
      .select({ fueraHorarioAt: schema.conversation.fueraHorarioAt })
      .from(schema.conversation)
      .where(eq(schema.conversation.id, conversationId))
      .limit(1);
    const reciente =
      conv?.fueraHorarioAt && Date.now() - conv.fueraHorarioAt.getTime() < ENTRE_AVISOS_MS;
    const despachar = ajustes.modo === "ia";
    if (reciente) return { despachar };

    await db
      .update(schema.conversation)
      .set({ fueraHorarioAt: new Date() })
      .where(eq(schema.conversation.id, conversationId));

    const destino = await destinoDeTransferencia(organizationId, contactId);
    const quien =
      destino.porque === "asesor"
        ? `${destino.miembro?.nombre ?? "su asesor"} (asesor del cliente)`
        : `${destino.miembro?.nombre ?? "el administrador"} (administrador principal: cliente nuevo o sin asesor)`;

    if (ajustes.modo === "mensaje") {
      await enviarTexto(ajustes.mensaje.replace("{horario}", ajustes.descripcion)).catch((err) =>
        console.error("[horario] no se pudo enviar el aviso:", err)
      );
      await notaDelSistema(
        organizationId,
        conversationId,
        `🌙 Mensaje fuera de horario: se le envió el horario de atención. Pendiente para ${quien}.`
      );
    } else {
      await notaDelSistema(
        organizationId,
        conversationId,
        `🌙 Mensaje fuera de horario: la IA lo atiende y toma sus datos. Queda pendiente para ${quien} cuando esté disponible.`
      );
    }
    return { despachar };
  } catch (err) {
    console.error("[horario] no se pudo revisar el horario:", err);
    return { despachar: true };
  }
}

/** Lo que se le añade a las instrucciones de la IA fuera de horario. */
export function instruccionFueraDeHorario(ajustes: AjustesHorario): string {
  return (
    `\n\nIMPORTANTE — AHORA ESTAMOS FUERA DEL HORARIO DE ATENCIÓN (${ajustes.descripcion}, hora de Colombia). ` +
    "Atiende con normalidad: resuelve dudas del catálogo y, si el cliente es nuevo, toma sus datos. " +
    "Si pide cotización o un asesor, dile que un asesor lo contactará en el próximo horario hábil; " +
    "no pases la conversación a una persona ahora."
  );
}
