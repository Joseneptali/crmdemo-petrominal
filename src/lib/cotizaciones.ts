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
  /** Texto libre: «INMEDIATA», «8 DÍAS HÁBILES»… */
  diasEntrega: string | null;
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
    nit: string | null;
    direccion: string | null;
    ciudad: string | null;
  };
  asesor: { nombre: string; email: string } | null;
  moneda: string;
  ivaPorcentaje: number;
  validezDias: number;
  solicitud: string | null;
  formaPago: string | null;
  lugarEntrega: string | null;
  descuentoPorcentaje: number;
  /** Zona franca: IVA exento. */
  zonaFranca: boolean;
  /** Recuadro NOTA del PDF. */
  condiciones: string | null;
  /** Recuadro OBSERVACIONES del PDF. */
  notas: string | null;
  items: ItemCotizacionDto[];
  subtotal: number;
  descuento: number;
  /** Subtotal menos descuento: sobre ella se liquida el IVA. */
  base: number;
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

/** Texto por defecto del recuadro NOTA. */
export const CONDICIONES_POR_DEFECTO =
  "Agradecemos verificar esta cotización antes de generar su orden de compra, ya que una vez despachado el material no aceptamos devolución. Material cortado NO tiene cambio.";

export const FORMA_PAGO_POR_DEFECTO = "CONTADO";

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

/**
 * Subtotal → descuento → base → IVA (sobre la base; 0 en zona franca) → total.
 */
export function totales(
  items: { cantidadMilesimas: number; precioUnitarioCents: number }[],
  ivaPorcentaje: number,
  descuentoPorcentaje = 0,
  zonaFranca = false
): { subtotalCents: number; descuentoCents: number; baseCents: number; ivaCents: number; totalCents: number } {
  const subtotalCents = items.reduce(
    (s, i) => s + totalRenglonCents(i.cantidadMilesimas, i.precioUnitarioCents),
    0
  );
  const descuentoCents = Math.round((subtotalCents * descuentoPorcentaje) / 100);
  const baseCents = subtotalCents - descuentoCents;
  const ivaCents = zonaFranca ? 0 : Math.round((baseCents * ivaPorcentaje) / 100);
  return { subtotalCents, descuentoCents, baseCents, ivaCents, totalCents: baseCents + ivaCents };
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
