/**
 * Petrominal — contrato del catálogo de productos, compartido por la API y la UI.
 */

export type Producto = {
  id: string;
  referencia: string;
  descripcion: string;
  linea: string;
  grupo: string;
  marca: string;
  unidad: string;
  codigoBarras: string | null;
  origen: "siigo" | "manual";
  /** URL de la foto (con `?v=`), o null si todavía no tiene. */
  fotoUrl: string | null;
};

export type PaginaCatalogo = {
  productos: Producto[];
  total: number;
  pagina: number;
  porPagina: number;
};

export type ResumenCatalogo = {
  total: number;
  conFoto: number;
  lineas: { linea: string; total: number }[];
};

/** Tipos de imagen aceptados para la foto de un producto. */
export const FOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;

export function urlFoto(id: string, version: number): string {
  return `/api/catalogo/${id}/foto?v=${version}`;
}
