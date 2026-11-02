import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Petrominal — enlaces públicos firmados a un archivo (un PDF de cotización,
 * un adjunto saliente). Los usa Zernio, que exige una URL pública para mandar
 * un archivo por WhatsApp. La firma (HMAC con ENCRYPTION_KEY) hace que nadie
 * pueda adivinar la URL de otro archivo; caduca a los `dias` indicados.
 */

function firma(recurso: string, vence: number): string {
  return createHmac("sha256", Buffer.from(getEnv().ENCRYPTION_KEY, "base64"))
    .update(`${recurso}:${vence}`)
    .digest("base64url");
}

export function enlacePublico(ruta: string, recurso: string, dias = 30): string {
  const vence = Math.floor(Date.now() / 1000) + dias * 86400;
  const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
  return `${base}${ruta}?v=${vence}&f=${firma(recurso, vence)}`;
}

export function enlaceValido(recurso: string, url: URL): boolean {
  const vence = Number(url.searchParams.get("v"));
  const f = url.searchParams.get("f") ?? "";
  if (!Number.isFinite(vence) || vence < Date.now() / 1000) return false;
  const esperado = Buffer.from(firma(recurso, vence));
  const dado = Buffer.from(f);
  return esperado.length === dado.length && timingSafeEqual(esperado, dado);
}
