import { getEnv } from "@/lib/env";
import { isValidWebhookToken } from "@/server/inbox/webhook";
import { zernioSignatureFrom } from "@/server/zernio";
import { isAuthenticZernioDelivery } from "@/server/zernio/dispatch";
import { recibirEvento } from "@/server/webhooks/recibir";

/**
 * Petrominal — webhook público de WhatsApp por Zernio.
 *
 * Mismas dos capas que los demás: el segmento [webhookToken] (si no coincide →
 * 404 sin efectos) y la firma de Zernio. WhatsApp es el canal base, así que no
 * depende de `CHANNELS`. Zernio entrega todas las plataformas de la llave por
 * el mismo webhook: el reparto (`processZernioPayload`) decide qué es de quién.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ webhookToken: string }> };

/** Zernio no hace handshake; esto sirve para comprobar la URL a mano. */
export async function GET(_req: Request, { params }: Params) {
  const { webhookToken } = await params;
  if (!isValidWebhookToken(webhookToken, getEnv().META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(null, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function POST(req: Request, { params }: Params) {
  const { webhookToken } = await params;
  if (!isValidWebhookToken(webhookToken, getEnv().META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(null, { status: 404 });
  }
  const rawBody = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ received: true });
  }
  // Diagnóstico sin datos sensibles: qué evento llegó y de qué plataforma.
  const evt = payload as {
    event?: string;
    account?: { id?: string; accountId?: string; platform?: string };
    message?: { platform?: string; direction?: string; sender?: { id?: string } };
  } | null;
  const resumen =
    `evento=${evt?.event ?? "?"} plataforma=${evt?.account?.platform ?? evt?.message?.platform ?? "?"} ` +
    `cuenta=${evt?.account?.id ?? evt?.account?.accountId ?? "?"} direccion=${evt?.message?.direction ?? "?"} ` +
    `remitente=${evt?.message?.sender?.id ? "sí" : "no"} firma=${zernioSignatureFrom(req.headers) ? "sí" : "no"}`;
  if (!(await isAuthenticZernioDelivery(rawBody, zernioSignatureFrom(req.headers)))) {
    console.warn(`[zernio-wa] entrega rechazada por firma inválida (401): ${resumen}`);
    return new Response(null, { status: 401 });
  }
  console.info(`[zernio-wa] entrega recibida: ${resumen}`);
  return recibirEvento("zernio", payload, rawBody, "zernio-wa");
}
