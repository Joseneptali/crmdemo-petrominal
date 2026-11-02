/**
 * Petrominal — contrato del cotizador, compartido por la API y la UI.
 *
 * Los montos viajan en PESOS (número con hasta 2 decimales) hacia la UI y se
 * guardan en centavos enteros. Las cantidades admiten decimales (metros).
 */

export type ItemCotizacionDto = {
  id: string;
  productoId: string | null;
  referencia: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  fotoUrl: string | null;
};

export type CotizacionDto = {
  id: string;
  numero: number;
  estado: "borrador" | "enviada";
  contacto: {
    id: string;
    nombre: string;
    telefono: string | null;
    correo: string | null;
    empresa: string | null;
  };
  asesor: { nombre: string; email: string } | null;
  moneda: string;
  ivaPorcentaje: number;
  validezDias: number;
  condiciones: string | null;
  notas: string | null;
  items: ItemCotizacionDto[];
  subtotal: number;
  iva: number;
  total: number;
  createdAt: string;
  enviadaAt: string | null;
  envios: Record<string, unknown> | null;
  /** Referencias de los renglones sin foto: con alguna, no se puede enviar. */
  faltanFotos: string[];
  /** URL del PDF (con sesión). */
  pdfUrl: string;
};

export type CotizacionResumenDto = {
  id: string;
  numero: number;
  estado: "borrador" | "enviada";
  contactoNombre: string;
  asesorNombre: string | null;
  total: number;
  moneda: string;
  createdAt: string;
  enviadaAt: string | null;
};

export const CONDICIONES_POR_DEFECTO =
  "Precios en pesos colombianos. Forma de pago: a convenir. Tiempo de entrega: sujeto a disponibilidad al momento de la orden. Los productos cumplen la norma ASME B30.9 cuando aplica.";

export function aCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}

export function aMilesimas(cantidad: number): number {
  return Math.round(cantidad * 1000);
}

/** Total de un renglón en centavos (cantidad en milésimas × precio en centavos). */
export function totalRenglonCents(cantidadMilesimas: number, precioCents: number): number {
  return Math.round((cantidadMilesimas * precioCents) / 1000);
}

export function totales(
  items: { cantidadMilesimas: number; precioUnitarioCents: number }[],
  ivaPorcentaje: number
): { subtotalCents: number; ivaCents: number; totalCents: number } {
  const subtotalCents = items.reduce(
    (s, i) => s + totalRenglonCents(i.cantidadMilesimas, i.precioUnitarioCents),
    0
  );
  const ivaCents = Math.round((subtotalCents * ivaPorcentaje) / 100);
  return { subtotalCents, ivaCents, totalCents: subtotalCents + ivaCents };
}

export function formatoPesos(valor: number, moneda = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(valor);
}

export function numeroCotizacion(n: number): string {
  return `COT-${String(n).padStart(4, "0")}`;
}
