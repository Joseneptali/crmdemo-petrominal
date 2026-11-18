/**
 * Syrtel — cotización de prueba: la parte PURA (plantillas por nicho, totales,
 * cuándo se pide y cuándo ya salió). La usa el servidor y la prueban los tests.
 *
 * Es una DEMOSTRACIÓN del cotizador de Syrtel CRM con productos ficticios del
 * nicho del prospecto. No lleva precios de Syrtel CRM.
 */

export type NichoPrueba = "salud" | "educacion" | "contable" | "servicios" | "comercio";

export type ItemPrueba = {
  referencia: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  /** Pesos colombianos, sin IVA. */
  precio: number;
};

export type PlantillaPrueba = { nicho: NichoPrueba; titulo: string; items: ItemPrueba[] };

export const IVA_PRUEBA = 0.19;

const PLANTILLAS: Record<NichoPrueba, PlantillaPrueba> = {
  salud: {
    nicho: "salud",
    titulo: "Clínica / centro médico",
    items: [
      { referencia: "CON-01", descripcion: "Consulta de valoración", cantidad: 1, unidad: "UND", precio: 80000 },
      { referencia: "ODO-12", descripcion: "Limpieza dental profunda", cantidad: 1, unidad: "UND", precio: 150000 },
      { referencia: "EST-05", descripcion: "Blanqueamiento en consultorio (2 sesiones)", cantidad: 1, unidad: "PAQ", precio: 600000 },
    ],
  },
  educacion: {
    nicho: "educacion",
    titulo: "Colegio / instituto",
    items: [
      { referencia: "MAT-26", descripcion: "Matrícula año escolar", cantidad: 1, unidad: "UND", precio: 450000 },
      { referencia: "PEN-26", descripcion: "Pensión mensual", cantidad: 10, unidad: "MES", precio: 380000 },
      { referencia: "TRA-26", descripcion: "Transporte escolar mensual", cantidad: 10, unidad: "MES", precio: 150000 },
    ],
  },
  contable: {
    nicho: "contable",
    titulo: "Firma contable",
    items: [
      { referencia: "CON-M", descripcion: "Contabilidad mensual (hasta 200 documentos)", cantidad: 12, unidad: "MES", precio: 700000 },
      { referencia: "REN-PJ", descripcion: "Declaración de renta persona jurídica", cantidad: 1, unidad: "UND", precio: 1500000 },
      { referencia: "NOM-E", descripcion: "Nómina electrónica (hasta 10 empleados)", cantidad: 12, unidad: "MES", precio: 200000 },
    ],
  },
  servicios: {
    nicho: "servicios",
    titulo: "Servicios profesionales",
    items: [
      { referencia: "PLN-B", descripcion: "Plan básico de servicio mensual", cantidad: 3, unidad: "MES", precio: 500000 },
      { referencia: "PLN-C", descripcion: "Plan completo con visita en sitio", cantidad: 3, unidad: "MES", precio: 900000 },
      { referencia: "INS-01", descripcion: "Instalación y puesta en marcha", cantidad: 1, unidad: "UND", precio: 400000 },
    ],
  },
  comercio: {
    nicho: "comercio",
    titulo: "Comercio / distribución",
    items: [
      { referencia: "PRD-101", descripcion: "Producto estrella, presentación grande", cantidad: 10, unidad: "UND", precio: 45000 },
      { referencia: "PRD-205", descripcion: "Producto complementario", cantidad: 20, unidad: "UND", precio: 18000 },
      { referencia: "SRV-10", descripcion: "Entrega a domicilio en la ciudad", cantidad: 1, unidad: "UND", precio: 25000 },
    ],
  },
};

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** El nicho que mejor encaja con lo que la IA anotó (texto libre). */
export function nichoDe(texto: string | null | undefined): NichoPrueba {
  const t = sinTildes(texto ?? "");
  if (/clinic|medic|salud|odonto|dental|estetic|consultorio|hospital|ips|laborator|veterin|optic|psicolog|fisioter/.test(t)) return "salud";
  if (/colegio|escuela|institut|academ|universid|jardin|educa|curso|idioma/.test(t)) return "educacion";
  if (/contab|contador|cartera|cobr|pension|tribut|impuest|financ|credito|nomina/.test(t)) return "contable";
  if (/servicio|consultor|agencia|taller|inmobil|turism|hotel|abogad|legal|seguro|gimnasio|spa|belleza/.test(t)) return "servicios";
  return "comercio";
}

export function plantillaPrueba(nicho: NichoPrueba): PlantillaPrueba {
  return PLANTILLAS[nicho];
}

export function totalesPrueba(items: ItemPrueba[]): { subtotal: number; iva: number; total: number } {
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
  const iva = Math.round(subtotal * IVA_PRUEBA);
  return { subtotal, iva, total: subtotal + iva };
}

/** ¿La IA pidió la cotización de prueba? (`cotizacion_prueba` afirmativo, sin haber salido). */
export function pidePrueba(valor: unknown): boolean {
  if (valor === true) return true;
  if (typeof valor !== "string") return false;
  const t = sinTildes(valor.trim());
  if (!t || yaSalio(t)) return false;
  return !/^(no|false|ninguna|n\/a)$/.test(t);
}

/** Ya salió (o está saliendo): no se vuelve a enviar. */
export function yaSalio(valor: unknown): boolean {
  return typeof valor === "string" && /^envi/.test(sinTildes(valor.trim()));
}

/**
 * ¿La IA le acaba de prometer la cotización de ejemplo al prospecto? («ya va
 * en camino», «se la envío», «le llega»…). Es el disparo que no depende de que
 * el cerebro sepa escribir la clave `cotizacion_prueba` en la ficha.
 */
export function prometeCotizacionPrueba(texto: string): boolean {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/cotizacion (de )?(ejemplo|muestra|prueba)|cotizacion ficticia|pdf de (ejemplo|muestra)/.test(t)) return false;
  // Todavía la está ofreciendo y pide datos («¿me confirma su correo?»): aún no.
  if (/(correo|nombre|email)[^?]{0,60}\?/.test(t)) return false;
  return /(en camino|ya va|le llega|le llegara|enviando|se la envi|se la mando|le envie|enviada|acabo de enviar|le envio|aqui (le )?va)/.test(t);
}

