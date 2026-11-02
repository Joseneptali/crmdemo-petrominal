import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { MetaApiError } from "@/lib/meta/client";
import { fetchZernioAccounts, zernioAccountName } from "@/server/zernio/cuentas";
import {
  deleteZernioWhatsapp,
  getZernioWhatsappByOrg,
  saveZernioWhatsapp,
} from "@/server/zernio-whatsapp/credentials";

export const dynamic = "force-dynamic";

/** La URL que se pega en el webhook de Zernio (lleva el segmento secreto). */
function urlDelWebhook(): string {
  const env = getEnv();
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/zernio-wa/${env.META_WEBHOOK_VERIFY_TOKEN}`;
}

/** Petrominal — estado de WhatsApp por Zernio. La llave nunca sale entera. */
export const GET = withAuth(async (session) => {
  const creds = await getZernioWhatsappByOrg(session.organizationId);
  const puedeVerUrl = session.role === "owner" || session.role === "admin";
  return Response.json({
    connection: creds
      ? {
          accountRef: creds.accountRef,
          displayName: creds.displayName,
          status: creds.status,
          tokenLast4: creds.token.slice(-4),
          hasWebhookSecret: Boolean(creds.webhookSecret),
        }
      : null,
    webhookUrl: puedeVerUrl ? urlDelWebhook() : null,
  });
});

const putSchema = z.object({
  token: z.string().trim().min(1),
  accountRef: z.string().trim().min(1).nullish(),
  webhookSecret: z.string().trim().min(1).nullish(),
});

/**
 * Guarda la conexión validando ANTES la llave contra Zernio y resolviendo cuál
 * de sus cuentas es la de WhatsApp. Solo el propietario.
 */
export const PUT = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede conectar WhatsApp");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  let cuentas;
  try {
    cuentas = await fetchZernioAccounts(body.data.token);
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    if (err.status === 0 || err.status >= 500 || err.status === 429) {
      return apiError(503, "platform_unavailable", "No se pudo contactar a Zernio; intenta de nuevo");
    }
    return apiError(422, "invalid_token", "La API key de Zernio no es válida");
  }

  const whatsapp = cuentas.filter((c) => (c.platform ?? "").toLowerCase() === "whatsapp");
  const pedida = body.data.accountRef;
  const elegida = pedida
    ? whatsapp.find((c) => c._id === pedida)
    : whatsapp.length === 1
      ? whatsapp[0]
      : undefined;
  if (!elegida) {
    const candidatas = whatsapp.slice(0, 20).map((c) => ({ id: c._id, name: zernioAccountName(c) }));
    return Response.json(
      {
        error: {
          code: whatsapp.length === 0 ? "unknown_account" : "choose_account",
          message:
            whatsapp.length === 0
              ? "Esa llave no tiene ningún número de WhatsApp conectado en Zernio. Conéctalo primero en el panel de Zernio."
              : "Esa llave tiene varios números de WhatsApp: elige cuál conectar.",
          details: { accounts: candidatas },
        },
      },
      { status: 422 }
    );
  }

  const previa = await getZernioWhatsappByOrg(session.organizationId);
  await saveZernioWhatsapp({
    organizationId: session.organizationId,
    accountRef: elegida._id,
    displayName: zernioAccountName(elegida),
    token: body.data.token,
    webhookSecret: body.data.webhookSecret ?? previa?.webhookSecret ?? null,
  });
  return Response.json({
    ok: true,
    accountRef: elegida._id,
    accountName: zernioAccountName(elegida),
  });
});

export const DELETE = withAuth(async (session) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede desconectar WhatsApp");
  }
  await deleteZernioWhatsapp(session.organizationId);
  return Response.json({ ok: true });
});
