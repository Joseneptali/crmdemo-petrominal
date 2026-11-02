import { normalizeMx } from "@/lib/meta/client";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import type { ResolvedIdentity } from "@/server/inbox/identity";
import {
  isValidZernioSignature,
  isValidZernioSignatureAny,
  zernioSentAtSeconds,
  type ZernioEvent,
} from "@/server/zernio";
import { webhookVerifyToken } from "@/server/whatsapp/webhook-url";
import { WEBHOOKS_RECHECK_MS, webhookSecretsFromZernio } from "@/server/zernio/webhooks";
import { getZernioWhatsappByAccountRef } from "./credentials";

/**
 * Petrominal — entrada de WhatsApp por Zernio.
 *
 * Zernio entrega el mensaje en su formato unificado; aquí se normaliza y de ahí
 * en adelante corre el MISMO núcleo de ingesta que el WhatsApp directo: el
 * contacto queda en el canal `whatsapp` (con su teléfono), así plantillas,
 * pipeline, agente y reportes lo tratan igual.
 */

export type ZernioWhatsappInbound = {
  accountRef: string;
  senderId: string;
  phone: string | null;
  /** BSUID de Meta, si Zernio lo manda: reconcilia con la Cloud API directa. */
  waUserId: string | null;
  messageId: string;
  text: string | null;
  type: string;
  timestamp: string;
  profileName: string | null;
  threadRef: string | null;
};

const ATTACHMENT_TYPE: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  voice: "audio",
  file: "document",
  document: "document",
  sticker: "sticker",
};

/** La plataforma del evento (viene en la cuenta y en el mensaje). */
function plataforma(evt: ZernioEvent): string {
  return (evt.account?.platform ?? evt.message?.platform ?? "").toLowerCase();
}

export function esEventoWhatsapp(payload: unknown): boolean {
  const evt = payload as ZernioEvent | null;
  return !!evt && typeof evt === "object" && plataforma(evt) === "whatsapp";
}

/** El teléfono del remitente, si su id lo es (Zernio usa el `wa_id`). */
export function telefonoDelRemitente(senderId: string): string | null {
  const digitos = senderId.replace(/[^\d]/g, "");
  if (digitos.length < 8 || digitos.length > 15) return null;
  // Solo si el id ERA un número (con +, espacios o guiones), no un id opaco.
  if (!/^[+\d\s()-]+$/.test(senderId.trim())) return null;
  return normalizeMx(digitos);
}

/** Evento de Zernio → mensaje de WhatsApp, o nada. Función pura. */
export function normalizeZernioWhatsappEvent(payload: unknown): ZernioWhatsappInbound[] {
  const evt = payload as ZernioEvent | null;
  if (!evt || typeof evt !== "object") return [];
  if (plataforma(evt) !== "whatsapp") return [];
  if (evt.event !== "message.received") return [];
  if (evt.message?.direction && evt.message.direction !== "incoming") return [];

  const accountRef = evt.account?.id ?? evt.account?.accountId;
  const senderId = evt.message?.sender?.id;
  const messageId = evt.message?.id;
  if (!accountRef || !senderId || !messageId) return [];

  const text =
    typeof evt.message?.text === "string" && evt.message.text.length > 0
      ? evt.message.text
      : null;
  const adjunto = evt.message?.attachments?.[0];
  const type = text
    ? "text"
    : adjunto
      ? (ATTACHMENT_TYPE[adjunto.type ?? ""] ?? "unsupported")
      : null;
  if (!type) return [];

  const sender = evt.message?.sender;
  return [
    {
      accountRef,
      senderId,
      phone: telefonoDelRemitente(sender?.phoneNumber || senderId),
      waUserId: sender?.businessScopedUserId?.trim() || null,
      messageId,
      text,
      type,
      timestamp: zernioSentAtSeconds(evt.message?.sentAt),
      profileName: sender?.name?.trim() || null,
      threadRef: evt.message?.conversationId ?? evt.conversation?.id ?? null,
    },
  ];
}

export async function processZernioWhatsappEvent(payload: unknown): Promise<void> {
  const mensajes = normalizeZernioWhatsappEvent(payload);
  if (mensajes.length === 0) {
    const e = payload as ZernioEvent;
    console.warn(
      `[zernio-wa] evento descartado: evento=${e?.event ?? "?"} direccion=${e?.message?.direction ?? "?"} ` +
        `cuenta=${e?.account?.id ?? e?.account?.accountId ? "sí" : "no"} remitente=${e?.message?.sender?.id ? "sí" : "no"} ` +
        `id=${e?.message?.id ? "sí" : "no"} texto=${e?.message?.text ? "sí" : "no"} adjuntos=${e?.message?.attachments?.length ?? 0} ` +
        `claves=${Object.keys(e ?? {}).join(",")} claves_mensaje=${Object.keys(e?.message ?? {}).join(",")}`
    );
  }
  for (const evt of mensajes) {
    const creds = await getZernioWhatsappByAccountRef(evt.accountRef);
    if (!creds) {
      console.warn(
        `[zernio-wa] evento para una cuenta desconocida (${evt.accountRef}): ` +
          "guarda la conexión en Ajustes → WhatsApp por Zernio"
      );
      continue;
    }
    const identity: ResolvedIdentity = evt.phone
      ? { identity: evt.phone, channel: "whatsapp", phone: evt.phone, waUserId: evt.waUserId, profileName: evt.profileName }
      : {
          identity: `zw:${evt.senderId}`,
          channel: "whatsapp",
          phone: null,
          waUserId: evt.waUserId,
          profileName: evt.profileName,
        };
    await ingestInboundMessage({
      organizationId: creds.organizationId,
      identity,
      // Prefijado: nunca colisiona con un `wamid` de la Cloud API.
      waMessageId: `zw_${evt.messageId}`,
      type: evt.type,
      text: evt.text,
      timestamp: evt.timestamp,
      threadRef: evt.threadRef,
    });
  }
}

/**
 * ¿Esta entrega de WhatsApp la firmó Zernio? Vale el secreto guardado en la
 * conexión o, si no coincide, los de los webhooks de Zernio que apuntan aquí
 * (leídos con la llave guardada). Sin ningún secreto la capa queda apagada y
 * protege el segmento secreto de la URL, igual que los demás canales.
 */
export async function esEntregaWhatsappAutentica(
  rawBody: string,
  signature: string | null,
  evt: ZernioEvent
): Promise<boolean> {
  const accountRef = evt.account?.id ?? evt.account?.accountId;
  if (!accountRef) return true;
  const creds = await getZernioWhatsappByAccountRef(accountRef);
  if (!creds) return true; // nadie lo conectó: la ingesta lo descarta sin ingerir
  if (creds.webhookSecret && isValidZernioSignature(rawBody, signature, creds.webhookSecret)) {
    return true;
  }
  const segmento = webhookVerifyToken();
  const remotos = await webhookSecretsFromZernio(creds.token, segmento);
  if (remotos.length > 0 && isValidZernioSignatureAny(rawBody, signature, remotos)) return true;
  const frescos = await webhookSecretsFromZernio(creds.token, segmento, WEBHOOKS_RECHECK_MS);
  if (!creds.webhookSecret && frescos.length === 0) return true;
  return frescos.length > 0 && isValidZernioSignatureAny(rawBody, signature, frescos);
}
