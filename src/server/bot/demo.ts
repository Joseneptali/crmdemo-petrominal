/**
 * Syrtel — ¿el prospecto pidió una demo? Lo dice el motivo del handoff
 * («demo») o la ficha (`demo` con un valor afirmativo). Basta uno de los dos:
 * el cerebro no siempre manda el motivo tal cual.
 */
export function pideDemo(reason: string | undefined, ficha: unknown): boolean {
  if (reason && /demo/i.test(reason)) return true;
  if (!ficha || typeof ficha !== "object") return false;
  const v = (ficha as Record<string, unknown>).demo;
  if (v === true) return true;
  if (typeof v !== "string") return false;
  const t = v.trim().toLowerCase();
  return t !== "" && !/^(no|false|ninguna|n\/a)$/.test(t);
}
