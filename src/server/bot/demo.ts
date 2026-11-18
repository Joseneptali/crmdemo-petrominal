/**
 * Syrtel — ¿el prospecto pidió una demo? Lo dice el motivo del handoff
 * («demo») o la ficha (`demo` con un valor afirmativo). Basta uno de los dos:
 * el cerebro no siempre manda el motivo tal cual.
 */
export function pideDemo(reason: string | undefined, ficha: unknown): boolean {
  if (reason && /demo/i.test(reason)) return true;
  if (!ficha || typeof ficha !== "object") return false;
  const f = ficha as Record<string, unknown>;
  const v = f.demo;
  if (v === true) return true;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t !== "" && !/^(no|false|ninguna|n\/a)$/.test(t)) return true;
  }
  // La IA no siempre usa la clave «demo»: a veces lo anota en las notas
  // («Solicitó demo de 30 minutos»). Cuenta si alguna nota habla de pedirla.
  return Object.values(f).some(
    (x) => typeof x === "string" && /(solicit|pidi|quiere|agend|program|interesad)\w*[^.]{0,30}\bdemo/i.test(x) && !/\bno\s+(quiere|desea)[^.]{0,20}\bdemo/i.test(x)
  );
}
