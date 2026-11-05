import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { formatoPesos, numeroCotizacion } from "@/lib/cotizaciones";
import { enviarCorreo } from "@/server/correo";
import { sendMediaMessage, SendError } from "@/server/inbox/send";
import { bloqueosDeEnvio, CotizacionError, marcarEnviada, obtenerCotizacion } from "./index";
import { generarPdfCotizacion } from "./pdf";

/**
 * Petrominal — enviar una cotización al cliente por WhatsApp (PDF en su
 * conversación) o por correo (desde la cuenta del asesor que envía). Las dos
 * exigen que todos los productos tengan foto de referencia y precio.
 */

type Sesion = { organizationId: string; userId: string; role: string };

function nombreArchivo(numero: number): string {
  return `Cotizacion-Petrominal-${numeroCotizacion(numero)}.pdf`;
}

async function preparar(sesion: Sesion, id: string) {
  const dto = await obtenerCotizacion(sesion, id);
  const bloqueo = bloqueosDeEnvio(dto);
  if (bloqueo) throw new CotizacionError(422, "incompleta", bloqueo, { faltanFotos: dto.faltanFotos });
  const pdf = await generarPdfCotizacion(sesion.organizationId, dto);
  return { dto, pdf };
}

export async function enviarPorWhatsapp(sesion: Sesion, id: string, mensaje?: string): Promise<void> {
  const { dto, pdf } = await preparar(sesion, id);
  const [conv] = await getDb()
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, sesion.organizationId),
        eq(schema.conversation.contactId, dto.contacto.id),
        eq(schema.conversation.channel, "whatsapp"),
        eq(schema.conversation.isTest, false)
      )
    )
    .orderBy(desc(schema.conversation.lastMessageAt))
    .limit(1);
  if (!conv) {
    throw new CotizacionError(409, "sin_conversacion", "Este cliente no tiene una conversación de WhatsApp");
  }
  const caption =
    mensaje?.trim() ||
    `Cotización ${numeroCotizacion(dto.numero)} de Petrominal S.A.S. por ${formatoPesos(dto.total, dto.moneda)} (${dto.zonaFranca ? "IVA exento" : "IVA incluido"}). Quedamos atentos a sus comentarios.`;
  try {
    await sendMediaMessage({
      conversationId: conv.id,
      organizationId: sesion.organizationId,
      file: { data: pdf, mimeType: "application/pdf", fileName: nombreArchivo(dto.numero) },
      caption,
    });
  } catch (err) {
    if (err instanceof SendError) {
      throw new CotizacionError(
        err.code === "window_closed" ? 409 : 502,
        err.code,
        err.code === "window_closed"
          ? "Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo permite escribirle con una plantilla. Envíala por correo o pídele que escriba primero."
          : err.message
      );
    }
    throw err;
  }
  await marcarEnviada(sesion.organizationId, id, "whatsapp", { conversacion: conv.id });
}

export async function enviarPorCorreo(
  sesion: Sesion,
  id: string,
  para: string,
  mensaje?: string
): Promise<void> {
  const { dto, pdf } = await preparar(sesion, id);
  const num = numeroCotizacion(dto.numero);
  const cuerpo =
    mensaje?.trim() ||
    `Estimado(a) ${dto.contacto.nombre}:\n\nAdjuntamos la cotización ${num} de Petrominal S.A.S. por ${formatoPesos(dto.total, dto.moneda)} (${dto.zonaFranca ? "IVA exento" : "IVA incluido"}), con una validez de ${dto.validezDias} días.\n\nQuedamos atentos a cualquier inquietud.\n\nCordialmente,\n${dto.asesor?.nombre ?? "Equipo comercial Petrominal S.A.S."}`;
  await enviarCorreo(sesion.organizationId, sesion.userId, {
    para,
    asunto: `Cotización ${num} — Petrominal S.A.S.`,
    texto: cuerpo,
    adjuntos: [{ nombre: nombreArchivo(dto.numero), contenido: pdf, tipo: "application/pdf" }],
  });
  await marcarEnviada(sesion.organizationId, id, "correo", { a: para });
}
