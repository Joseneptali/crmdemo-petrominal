import { asc, count, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  FOTO_MAX_BYTES,
  FOTO_MIMES,
  urlFoto,
  type PaginaCatalogo,
  type Producto,
  type ResumenCatalogo,
} from "@/lib/catalogo";
import { readMediaFile, saveMediaFile } from "@/server/whatsapp/media";
import semilla from "./semilla-petrominal.json";

/**
 * Petrominal — catálogo de productos del cotizador. Las rutas validan sesión y
 * permiso; aquí vive lo demás.
 */

export class CatalogoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type Fila = typeof schema.producto.$inferSelect;

function aDto(f: Fila): Producto {
  return {
    id: f.id,
    referencia: f.referencia,
    descripcion: f.descripcion,
    linea: f.linea,
    grupo: f.grupo,
    marca: f.marca,
    unidad: f.unidad,
    codigoBarras: f.codigoBarras,
    origen: f.origen,
    fotoUrl: f.fotoMime ? urlFoto(f.id, f.fotoVersion) : null,
  };
}

/** Dónde vive la foto de un producto dentro de MEDIA_DIR. */
function assetFoto(productoId: string): string {
  return `${productoId}-foto`;
}

const texto = (max: number) => z.string().trim().max(max);

export const productoSchema = z.object({
  referencia: texto(60).min(1, "La referencia es obligatoria"),
  descripcion: texto(200).min(1, "La descripción es obligatoria"),
  linea: texto(80).optional(),
  grupo: texto(80).optional(),
  marca: texto(80).optional(),
  unidad: texto(12).optional(),
  codigoBarras: texto(40).nullable().optional(),
});

export const productoParcialSchema = productoSchema.partial();

export const filtroSchema = z.object({
  q: z.string().trim().max(100).optional(),
  linea: z.string().trim().max(80).optional(),
  foto: z.enum(["todas", "con", "sin"]).default("todas"),
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(30),
});

export type FiltroCatalogo = z.infer<typeof filtroSchema>;

function condiciones(organizationId: string, f: FiltroCatalogo): SQL {
  const extra: (SQL | undefined)[] = [eq(schema.producto.activo, true)];
  if (f.q) {
    // Cada palabra debe aparecer en la referencia, la descripción o el grupo:
    // «eslinga 2 mts» encuentra «ESLINGA T3 Ref.: EEF1-93 X 2 Mts.».
    for (const palabra of f.q.split(/\s+/).filter(Boolean).slice(0, 6)) {
      const p = `%${palabra.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      extra.push(
        or(
          ilike(schema.producto.referencia, p),
          ilike(schema.producto.descripcion, p),
          ilike(schema.producto.grupo, p),
          ilike(schema.producto.marca, p)
        )
      );
    }
  }
  if (f.linea) extra.push(eq(schema.producto.linea, f.linea));
  if (f.foto === "con") extra.push(isNotNull(schema.producto.fotoMime));
  if (f.foto === "sin") extra.push(isNull(schema.producto.fotoMime));
  return scoped(schema.producto.organizationId, organizationId, ...extra);
}

export async function listarProductos(
  organizationId: string,
  f: FiltroCatalogo
): Promise<PaginaCatalogo> {
  const db = getDb();
  const where = condiciones(organizationId, f);
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.producto)
    .where(where);
  const filas = await db
    .select()
    .from(schema.producto)
    .where(where)
    .orderBy(asc(schema.producto.linea), asc(schema.producto.grupo), asc(schema.producto.descripcion))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);
  return { productos: filas.map(aDto), total: Number(n), pagina: f.pagina, porPagina: f.porPagina };
}

export async function resumenCatalogo(organizationId: string): Promise<ResumenCatalogo> {
  const db = getDb();
  const where = scoped(
    schema.producto.organizationId,
    organizationId,
    eq(schema.producto.activo, true)
  );
  const [tot] = await db
    .select({
      total: count(),
      conFoto: sql<number>`count(${schema.producto.fotoMime})`,
    })
    .from(schema.producto)
    .where(where);
  const lineas = await db
    .select({ linea: schema.producto.linea, total: count() })
    .from(schema.producto)
    .where(where)
    .groupBy(schema.producto.linea)
    .orderBy(asc(schema.producto.linea));
  return {
    total: Number(tot?.total ?? 0),
    conFoto: Number(tot?.conFoto ?? 0),
    lineas: lineas.map((l) => ({ linea: l.linea, total: Number(l.total) })),
  };
}

export async function obtenerProducto(
  organizationId: string,
  id: string
): Promise<Fila | null> {
  const [fila] = await getDb()
    .select()
    .from(schema.producto)
    .where(scoped(schema.producto.organizationId, organizationId, eq(schema.producto.id, id)))
    .limit(1);
  return fila ?? null;
}

/** Varios productos por id, en una consulta (el cotizador los pide juntos). */
export async function obtenerProductos(
  organizationId: string,
  ids: string[]
): Promise<Map<string, Fila>> {
  if (ids.length === 0) return new Map();
  const filas = await getDb()
    .select()
    .from(schema.producto)
    .where(
      scoped(
        schema.producto.organizationId,
        organizationId,
        sql`${schema.producto.id} in (${sql.join(
          ids.map((i) => sql`${i}`),
          sql`, `
        )})`
      )
    );
  return new Map(filas.map((f) => [f.id, f]));
}

function esDuplicado(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

export async function crearProducto(
  organizationId: string,
  userId: string,
  datos: z.infer<typeof productoSchema>
): Promise<Producto> {
  try {
    const [fila] = await getDb()
      .insert(schema.producto)
      .values({
        id: newId("producto"),
        organizationId,
        referencia: datos.referencia,
        descripcion: datos.descripcion.toUpperCase(),
        linea: (datos.linea ?? "").toUpperCase(),
        grupo: (datos.grupo ?? "").toUpperCase(),
        marca: (datos.marca ?? "").toUpperCase(),
        unidad: (datos.unidad ?? "").toUpperCase() || "UND",
        codigoBarras: datos.codigoBarras || null,
        origen: "manual",
        creadoPor: userId,
      })
      .returning();
    if (!fila) throw new Error("insert sin fila");
    return aDto(fila);
  } catch (err) {
    if (esDuplicado(err)) {
      throw new CatalogoError(409, "duplicado", `Ya existe un producto con la referencia ${datos.referencia}`);
    }
    throw err;
  }
}

export async function actualizarProducto(
  organizationId: string,
  id: string,
  datos: z.infer<typeof productoParcialSchema>
): Promise<Producto> {
  const cambios: Partial<typeof schema.producto.$inferInsert> = { updatedAt: new Date() };
  if (datos.referencia !== undefined) cambios.referencia = datos.referencia;
  if (datos.descripcion !== undefined) cambios.descripcion = datos.descripcion.toUpperCase();
  if (datos.linea !== undefined) cambios.linea = datos.linea.toUpperCase();
  if (datos.grupo !== undefined) cambios.grupo = datos.grupo.toUpperCase();
  if (datos.marca !== undefined) cambios.marca = datos.marca.toUpperCase();
  if (datos.unidad !== undefined) cambios.unidad = datos.unidad.toUpperCase() || "UND";
  if (datos.codigoBarras !== undefined) cambios.codigoBarras = datos.codigoBarras || null;
  try {
    const [fila] = await getDb()
      .update(schema.producto)
      .set(cambios)
      .where(scoped(schema.producto.organizationId, organizationId, eq(schema.producto.id, id)))
      .returning();
    if (!fila) throw new CatalogoError(404, "not_found", "Producto no encontrado");
    return aDto(fila);
  } catch (err) {
    if (esDuplicado(err)) {
      throw new CatalogoError(409, "duplicado", "Ya existe otro producto con esa referencia");
    }
    throw err;
  }
}

/** Comprueba la firma real del archivo: el `type` del navegador no basta. */
function mimeReal(buf: Buffer): (typeof FOTO_MIMES)[number] | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  return null;
}

export async function guardarFoto(
  organizationId: string,
  id: string,
  datos: Buffer
): Promise<Producto> {
  if (datos.length === 0) throw new CatalogoError(422, "vacio", "La imagen está vacía");
  if (datos.length > FOTO_MAX_BYTES) {
    throw new CatalogoError(413, "muy_grande", "La imagen pesa más de 5 MB");
  }
  const mime = mimeReal(datos);
  if (!mime) throw new CatalogoError(415, "tipo", "Solo se aceptan fotos JPG o PNG");
  const actual = await obtenerProducto(organizationId, id);
  if (!actual) throw new CatalogoError(404, "not_found", "Producto no encontrado");

  await saveMediaFile(organizationId, assetFoto(id), datos, mime);
  const [fila] = await getDb()
    .update(schema.producto)
    .set({ fotoMime: mime, fotoVersion: actual.fotoVersion + 1, updatedAt: new Date() })
    .where(scoped(schema.producto.organizationId, organizationId, eq(schema.producto.id, id)))
    .returning();
  if (!fila) throw new CatalogoError(404, "not_found", "Producto no encontrado");
  return aDto(fila);
}

/** El binario de la foto, o null si el producto no tiene o el archivo se perdió. */
export async function leerFoto(
  organizationId: string,
  id: string
): Promise<{ data: Buffer; mime: string } | null> {
  const fila = await obtenerProducto(organizationId, id);
  if (!fila?.fotoMime) return null;
  try {
    return { data: await readMediaFile(organizationId, assetFoto(id)), mime: fila.fotoMime };
  } catch {
    return null;
  }
}

type FilaSemilla = [string, string, string, string, string, string, string | null];

/**
 * Carga (o completa) el inventario de Siigo. Idempotente: una referencia que ya
 * existe no se toca, así no se pisan fotos ni cambios hechos a mano.
 */
export async function importarSemilla(organizationId: string): Promise<{ nuevos: number; total: number }> {
  const filas = semilla as unknown as FilaSemilla[];
  const db = getDb();
  let nuevos = 0;
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE).map(([referencia, descripcion, linea, grupo, marca, unidad, codigoBarras]) => ({
      id: newId("producto"),
      organizationId,
      referencia,
      descripcion,
      linea,
      grupo,
      marca,
      unidad: unidad || "UND",
      codigoBarras,
      origen: "siigo" as const,
    }));
    const insertados = await db
      .insert(schema.producto)
      .values(lote)
      .onConflictDoNothing({ target: [schema.producto.organizationId, schema.producto.referencia] })
      .returning({ id: schema.producto.id });
    nuevos += insertados.length;
  }
  return { nuevos, total: filas.length };
}

/** ¿El catálogo de esta organización está vacío? (para ofrecer la carga). */
export async function catalogoVacio(organizationId: string): Promise<boolean> {
  const [fila] = await getDb()
    .select({ id: schema.producto.id })
    .from(schema.producto)
    .where(scoped(schema.producto.organizationId, organizationId))
    .limit(1);
  return !fila;
}
