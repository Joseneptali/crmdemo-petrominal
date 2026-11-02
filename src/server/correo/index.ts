import { and, eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * Petrominal — el correo corporativo de cada asesor (SMTP). Pensado para Yahoo
 * Small Business (`smtp.bizmail.yahoo.com:465`, SSL) con contraseña de
 * aplicación, pero sirve cualquier SMTP. La contraseña va cifrada y nunca sale
 * en una respuesta.
 */

export class CorreoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const YAHOO_SMALL_BUSINESS = { host: "smtp.bizmail.yahoo.com", puerto: 465, seguro: true };

export const correoSchema = z.object({
  host: z.string().trim().min(3).max(200).optional(),
  puerto: z.number().int().min(1).max(65535).optional(),
  seguro: z.boolean().optional(),
  usuario: z.string().trim().email("El usuario es tu correo completo"),
  /** Contraseña de aplicación. Vacía = conservar la guardada. */
  clave: z.string().max(200).optional(),
  nombreRemitente: z.string().trim().max(120).nullable().optional(),
  firma: z.string().max(2000).nullable().optional(),
});


export type CorreoDto = {
  host: string;
  puerto: number;
  seguro: boolean;
  usuario: string;
  nombreRemitente: string | null;
  firma: string | null;
  tieneClave: true;
};

type Fila = typeof schema.asesorCorreo.$inferSelect;

async function fila(organizationId: string, userId: string): Promise<Fila | null> {
  const [f] = await getDb()
    .select()
    .from(schema.asesorCorreo)
    .where(and(eq(schema.asesorCorreo.organizationId, organizationId), eq(schema.asesorCorreo.userId, userId)))
    .limit(1);
  return f ?? null;
}

export async function miCorreo(organizationId: string, userId: string): Promise<CorreoDto | null> {
  const f = await fila(organizationId, userId);
  if (!f) return null;
  return {
    host: f.host,
    puerto: f.puerto,
    seguro: f.seguro,
    usuario: f.usuario,
    nombreRemitente: f.nombreRemitente,
    firma: f.firma,
    tieneClave: true,
  };
}

function transporte(c: { host: string; puerto: number; seguro: boolean; usuario: string; clave: string }) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.puerto,
    secure: c.seguro,
    auth: { user: c.usuario, pass: c.clave },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

function traducirError(err: unknown): CorreoError {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e.code === "EAUTH" || e.responseCode === 535) {
    return new CorreoError(
      422,
      "auth",
      "El servidor de correo rechazó el usuario o la contraseña. Usa una contraseña de aplicación generada en la seguridad de tu cuenta de Yahoo."
    );
  }
  if (e.code === "ETIMEDOUT" || e.code === "ECONNECTION" || e.code === "ESOCKET" || e.code === "ENOTFOUND") {
    return new CorreoError(503, "conexion", "No se pudo conectar al servidor de correo; revisa el servidor y el puerto");
  }
  return new CorreoError(502, "smtp", `El servidor de correo respondió: ${e.message ?? "error desconocido"}`);
}

/** Guarda la configuración, comprobando antes que el servidor la acepta. */
export async function guardarMiCorreo(
  organizationId: string,
  userId: string,
  datos: z.infer<typeof correoSchema>
): Promise<CorreoDto> {
  const entrada = {
    ...datos,
    host: datos.host ?? YAHOO_SMALL_BUSINESS.host,
    puerto: datos.puerto ?? YAHOO_SMALL_BUSINESS.puerto,
    seguro: datos.seguro ?? YAHOO_SMALL_BUSINESS.seguro,
  };
  const previa = await fila(organizationId, userId);
  const clave =
    entrada.clave && entrada.clave.trim()
      ? entrada.clave.replace(/\s+/g, "")
      : previa
        ? decryptSecret({ cipher: previa.claveCipher, iv: previa.claveIv, tag: previa.claveTag })
        : null;
  if (!clave) throw new CorreoError(422, "clave", "Falta la contraseña de aplicación");

  try {
    await transporte({ ...entrada, clave }).verify();
  } catch (err) {
    throw traducirError(err);
  }

  const enc = encryptSecret(clave);
  const valores = {
    host: entrada.host,
    puerto: entrada.puerto,
    seguro: entrada.seguro,
    usuario: entrada.usuario,
    nombreRemitente: entrada.nombreRemitente ?? null,
    firma: entrada.firma ?? null,
    claveCipher: enc.cipher,
    claveIv: enc.iv,
    claveTag: enc.tag,
    updatedAt: new Date(),
  };
  const db = getDb();
  if (previa) {
    await db.update(schema.asesorCorreo).set(valores).where(eq(schema.asesorCorreo.id, previa.id));
  } else {
    await db.insert(schema.asesorCorreo).values({ id: newId("asesorCorreo"), organizationId, userId, ...valores });
  }
  return (await miCorreo(organizationId, userId))!;
}

export async function borrarMiCorreo(organizationId: string, userId: string): Promise<void> {
  await getDb()
    .delete(schema.asesorCorreo)
    .where(and(eq(schema.asesorCorreo.organizationId, organizationId), eq(schema.asesorCorreo.userId, userId)));
}

/** Envía un correo desde la cuenta del asesor. */
export async function enviarCorreo(
  organizationId: string,
  userId: string,
  mensaje: {
    para: string;
    asunto: string;
    texto: string;
    html?: string;
    adjuntos?: { nombre: string; contenido: Buffer; tipo: string }[];
    eventoIcs?: string;
  }
): Promise<{ messageId: string }> {
  const f = await fila(organizationId, userId);
  if (!f) {
    throw new CorreoError(
      409,
      "sin_correo",
      "Primero configura tu correo de envío (Cotizaciones → Mi correo de envío)"
    );
  }
  const clave = decryptSecret({ cipher: f.claveCipher, iv: f.claveIv, tag: f.claveTag });
  const firma = f.firma?.trim() ? `\n\n--\n${f.firma.trim()}` : "";
  try {
    const info = await transporte({ host: f.host, puerto: f.puerto, seguro: f.seguro, usuario: f.usuario, clave }).sendMail({
      from: f.nombreRemitente ? { name: f.nombreRemitente, address: f.usuario } : f.usuario,
      to: mensaje.para,
      subject: mensaje.asunto,
      text: mensaje.texto + firma,
      ...(mensaje.html ? { html: mensaje.html } : {}),
      attachments: (mensaje.adjuntos ?? []).map((a) => ({
        filename: a.nombre,
        content: a.contenido,
        contentType: a.tipo,
      })),
      ...(mensaje.eventoIcs ? { icalEvent: { method: "REQUEST", content: mensaje.eventoIcs } } : {}),
    });
    return { messageId: String(info.messageId ?? "") };
  } catch (err) {
    throw traducirError(err);
  }
}
