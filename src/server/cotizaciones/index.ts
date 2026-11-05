import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { veTodo } from "@/lib/asesores";
import { urlFoto } from "@/lib/catalogo";
import {
  aCentavos,
  aMilesimas,
  CONDICIONES_POR_DEFECTO,
  FORMA_PAGO_POR_DEFECTO,
  totales,
  type CotizacionDto,
  type CotizacionResumenDto,
} from "@/lib/cotizaciones";

/**
 * Petrominal — cotizaciones. Las rutas validan sesión; aquí vive lo demás,
 * incluida la cartera: un asesor solo ve y edita cotizaciones de sus clientes.
 */

export class CotizacionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

type Sesion = { organizationId: string; userId: string; role: string };

/** Un dato de la ficha que pudo guardarse con distintos nombres. */
export function deFicha(ficha: unknown, claves: string[]): string | null {
  if (!ficha || typeof ficha !== "object") return null;
  const f = ficha as Record<string, unknown>;
  const normal = (k: string) => k.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  const porClave = new Map(Object.entries(f).map(([k, v]) => [normal(k), v]));
  for (const c of claves) {
    const v = porClave.get(normal(c));
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  // El correo se rescata aunque la IA lo haya dejado dentro de otra clave (p. ej. «notas»).
  if (claves === CLAVES.correo) return correoEnTexto(Object.values(f));
  return null;
}

const RE_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** Primer correo electrónico que aparezca en los valores de texto. */
export function correoEnTexto(valores: unknown[]): string | null {
  for (const v of valores) {
    if (typeof v !== "string") continue;
    const m = RE_CORREO.exec(v);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

export const CLAVES = {
  correo: ["correo", "email", "correo_electronico", "correoelectronico", "e-mail", "mail"],
  empresa: ["empresa", "company", "razon_social", "razonsocial", "compania"],
  nit: ["nit", "nit_empresa", "documento", "rut"],
  ciudad: ["ciudad", "city", "municipio"],
  direccion: ["direccion", "address", "direccion_empresa", "domicilio"],
  cargo: ["cargo", "puesto", "rol"],
};

const itemSchema = z.object({
  productoId: z.string().min(1).nullable(),
  referencia: z.string().trim().min(1).max(60),
  descripcion: z.string().trim().min(1).max(300),
  unidad: z.string().trim().max(12).optional(),
  cantidad: z.number().positive().max(1_000_000),
  precioUnitario: z.number().min(0).max(100_000_000_000),
  diasEntrega: z.string().trim().max(40).nullable().optional(),
});

const textoCorto = z.string().trim().max(300).nullable().optional();

export const guardarSchema = z.object({
  ivaPorcentaje: z.number().int().min(0).max(100).optional(),
  validezDias: z.number().int().min(1).max(365).optional(),
  solicitud: textoCorto,
  formaPago: textoCorto,
  lugarEntrega: textoCorto,
  descuentoPorcentaje: z.number().int().min(0).max(100).optional(),
  zonaFranca: z.boolean().optional(),
  condiciones: z.string().max(4000).nullable().optional(),
  notas: z.string().max(4000).nullable().optional(),
  items: z.array(itemSchema).max(200).optional(),
});

async function contactoVisible(sesion: Sesion, contactId: string) {
  const [c] = await getDb()
    .select()
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, sesion.organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  if (!c) throw new CotizacionError(404, "not_found", "Cliente no encontrado");
  if (!veTodo(sesion.role) && c.asesorUserId !== sesion.userId) {
    throw new CotizacionError(404, "not_found", "Cliente no encontrado");
  }
  return c;
}

export async function crearCotizacion(sesion: Sesion, contactId: string): Promise<string> {
  const c = await contactoVisible(sesion, contactId);
  const db = getDb();
  // Consecutivo por organización; el índice único evita dos con el mismo número.
  for (let intento = 0; intento < 3; intento++) {
    const [fila] = await db
      .select({ n: max(schema.cotizacion.numero) })
      .from(schema.cotizacion)
      .where(scoped(schema.cotizacion.organizationId, sesion.organizationId));
    const numero = (fila?.n ?? 0) + 1;
    try {
      const id = newId("cotizacion");
      await db.insert(schema.cotizacion).values({
        id,
        organizationId: sesion.organizationId,
        numero,
        contactId: c.id,
        // La cotización es del asesor del cliente; si no tiene, de quien la hace.
        asesorUserId: c.asesorUserId ?? sesion.userId,
        condiciones: CONDICIONES_POR_DEFECTO,
        formaPago: FORMA_PAGO_POR_DEFECTO,
      });
      return id;
    } catch (err) {
      const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
      if (code !== "23505") throw err;
    }
  }
  throw new CotizacionError(409, "conflicto", "No se pudo numerar la cotización; intenta de nuevo");
}

async function filaVisible(sesion: Sesion, id: string) {
  const [fila] = await getDb()
    .select({ cot: schema.cotizacion, contact: schema.contact })
    .from(schema.cotizacion)
    .innerJoin(schema.contact, eq(schema.cotizacion.contactId, schema.contact.id))
    .where(scoped(schema.cotizacion.organizationId, sesion.organizationId, eq(schema.cotizacion.id, id)))
    .limit(1);
  if (!fila) throw new CotizacionError(404, "not_found", "Cotización no encontrada");
  if (
    !veTodo(sesion.role) &&
    fila.contact.asesorUserId !== sesion.userId &&
    fila.cot.asesorUserId !== sesion.userId
  ) {
    throw new CotizacionError(404, "not_found", "Cotización no encontrada");
  }
  return fila;
}

export async function obtenerCotizacion(sesion: Sesion, id: string): Promise<CotizacionDto> {
  const { cot, contact } = await filaVisible(sesion, id);
  const db = getDb();
  const items = await db
    .select({ item: schema.cotizacionItem, producto: schema.producto })
    .from(schema.cotizacionItem)
    .leftJoin(schema.producto, eq(schema.cotizacionItem.productoId, schema.producto.id))
    .where(
      scoped(
        schema.cotizacionItem.organizationId,
        sesion.organizationId,
        eq(schema.cotizacionItem.cotizacionId, id)
      )
    )
    .orderBy(asc(schema.cotizacionItem.posicion));
  const [asesor] = cot.asesorUserId
    ? await db
        .select({ nombre: schema.user.name, email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.id, cot.asesorUserId))
        .limit(1)
    : [];
  const t = totales(
    items.map((r) => r.item),
    cot.ivaPorcentaje,
    cot.descuentoPorcentaje,
    cot.zonaFranca
  );
  return {
    id: cot.id,
    numero: cot.numero,
    estado: cot.estado,
    contacto: {
      id: contact.id,
      nombre: contact.name,
      telefono: contact.phone,
      correo: deFicha(contact.ficha, CLAVES.correo),
      empresa: deFicha(contact.ficha, CLAVES.empresa),
      nit: deFicha(contact.ficha, CLAVES.nit),
      direccion: deFicha(contact.ficha, CLAVES.direccion),
      ciudad: deFicha(contact.ficha, CLAVES.ciudad),
    },
    asesor: asesor ?? null,
    moneda: cot.moneda,
    ivaPorcentaje: cot.ivaPorcentaje,
    validezDias: cot.validezDias,
    solicitud: cot.solicitud,
    formaPago: cot.formaPago,
    lugarEntrega: cot.lugarEntrega,
    descuentoPorcentaje: cot.descuentoPorcentaje,
    zonaFranca: cot.zonaFranca,
    condiciones: cot.condiciones,
    notas: cot.notas,
    items: items.map(({ item, producto }) => ({
      id: item.id,
      productoId: item.productoId,
      referencia: item.referencia,
      descripcion: item.descripcion,
      unidad: item.unidad,
      cantidad: item.cantidadMilesimas / 1000,
      precioUnitario: item.precioUnitarioCents / 100,
      diasEntrega: item.diasEntrega,
      fotoUrl: producto?.fotoMime ? urlFoto(producto.id, producto.fotoVersion) : null,
    })),
    subtotal: t.subtotalCents / 100,
    descuento: t.descuentoCents / 100,
    base: t.baseCents / 100,
    iva: t.ivaCents / 100,
    total: t.totalCents / 100,
    createdAt: cot.createdAt.toISOString(),
    enviadaAt: cot.enviadaAt?.toISOString() ?? null,
    envios: cot.envios ?? null,
    faltanFotos: items.filter((r) => !r.producto?.fotoMime).map((r) => r.item.referencia),
    pdfUrl: `/api/cotizaciones/${cot.id}/pdf`,
  };
}

export async function guardarCotizacion(
  sesion: Sesion,
  id: string,
  datos: z.infer<typeof guardarSchema>
): Promise<void> {
  await filaVisible(sesion, id);
  const db = getDb();
  if (datos.items) {
    // Los productos citados deben ser de esta organización.
    const ids = datos.items.map((i) => i.productoId).filter((x): x is string => !!x);
    if (ids.length) {
      const encontrados = await db
        .select({ id: schema.producto.id })
        .from(schema.producto)
        .where(scoped(schema.producto.organizationId, sesion.organizationId, inArray(schema.producto.id, ids)));
      if (encontrados.length !== new Set(ids).size) {
        throw new CotizacionError(422, "producto", "Hay productos que no son del catálogo");
      }
    }
    await db
      .delete(schema.cotizacionItem)
      .where(
        scoped(schema.cotizacionItem.organizationId, sesion.organizationId, eq(schema.cotizacionItem.cotizacionId, id))
      );
    if (datos.items.length) {
      await db.insert(schema.cotizacionItem).values(
        datos.items.map((i, posicion) => ({
          id: newId("cotizacionItem"),
          organizationId: sesion.organizationId,
          cotizacionId: id,
          productoId: i.productoId,
          posicion,
          referencia: i.referencia,
          descripcion: i.descripcion,
          unidad: i.unidad || "UND",
          cantidadMilesimas: aMilesimas(i.cantidad),
          precioUnitarioCents: aCentavos(i.precioUnitario),
          diasEntrega: i.diasEntrega || null,
        }))
      );
    }
  }
  const [cot] = await db
    .select({
      iva: schema.cotizacion.ivaPorcentaje,
      descuento: schema.cotizacion.descuentoPorcentaje,
      zonaFranca: schema.cotizacion.zonaFranca,
    })
    .from(schema.cotizacion)
    .where(eq(schema.cotizacion.id, id))
    .limit(1);
  const items = await db
    .select({
      cantidadMilesimas: schema.cotizacionItem.cantidadMilesimas,
      precioUnitarioCents: schema.cotizacionItem.precioUnitarioCents,
    })
    .from(schema.cotizacionItem)
    .where(eq(schema.cotizacionItem.cotizacionId, id));
  const iva = datos.ivaPorcentaje ?? cot?.iva ?? 19;
  const descuento = datos.descuentoPorcentaje ?? cot?.descuento ?? 0;
  const zonaFranca = datos.zonaFranca ?? cot?.zonaFranca ?? false;
  const t = totales(items, iva, descuento, zonaFranca);

  await db
    .update(schema.cotizacion)
    .set({
      ...(datos.ivaPorcentaje !== undefined ? { ivaPorcentaje: datos.ivaPorcentaje } : {}),
      ...(datos.validezDias !== undefined ? { validezDias: datos.validezDias } : {}),
      ...(datos.condiciones !== undefined ? { condiciones: datos.condiciones } : {}),
      ...(datos.notas !== undefined ? { notas: datos.notas } : {}),
      ...(datos.solicitud !== undefined ? { solicitud: datos.solicitud || null } : {}),
      ...(datos.formaPago !== undefined ? { formaPago: datos.formaPago || null } : {}),
      ...(datos.lugarEntrega !== undefined ? { lugarEntrega: datos.lugarEntrega || null } : {}),
      ...(datos.descuentoPorcentaje !== undefined ? { descuentoPorcentaje: datos.descuentoPorcentaje } : {}),
      ...(datos.zonaFranca !== undefined ? { zonaFranca: datos.zonaFranca } : {}),
      subtotalCents: t.subtotalCents,
      totalCents: t.totalCents,
      updatedAt: new Date(),
    })
    .where(eq(schema.cotizacion.id, id));
}

export async function listarCotizaciones(
  sesion: Sesion,
  contactId?: string
): Promise<CotizacionResumenDto[]> {
  const filas = await getDb()
    .select({
      cot: schema.cotizacion,
      contactoNombre: schema.contact.name,
      contactoAsesor: schema.contact.asesorUserId,
      asesorNombre: schema.user.name,
    })
    .from(schema.cotizacion)
    .innerJoin(schema.contact, eq(schema.cotizacion.contactId, schema.contact.id))
    .leftJoin(schema.user, eq(schema.cotizacion.asesorUserId, schema.user.id))
    .where(
      scoped(
        schema.cotizacion.organizationId,
        sesion.organizationId,
        contactId ? eq(schema.cotizacion.contactId, contactId) : undefined,
        veTodo(sesion.role)
          ? undefined
          : sql`(${schema.contact.asesorUserId} = ${sesion.userId} or ${schema.cotizacion.asesorUserId} = ${sesion.userId})`
      )
    )
    .orderBy(desc(schema.cotizacion.numero))
    .limit(300);
  return filas.map((f) => ({
    id: f.cot.id,
    numero: f.cot.numero,
    estado: f.cot.estado,
    contactoNombre: f.contactoNombre,
    asesorNombre: f.asesorNombre,
    total: f.cot.totalCents / 100,
    moneda: f.cot.moneda,
    createdAt: f.cot.createdAt.toISOString(),
    enviadaAt: f.cot.enviadaAt?.toISOString() ?? null,
  }));
}

/** Lo que impide enviar: sin renglones, sin precio o sin foto. */
export function bloqueosDeEnvio(dto: CotizacionDto): string | null {
  if (dto.items.length === 0) return "La cotización no tiene productos";
  const sinPrecio = dto.items.filter((i) => i.precioUnitario <= 0).map((i) => i.referencia);
  if (sinPrecio.length) return `Falta el precio de: ${sinPrecio.join(", ")}`;
  if (dto.faltanFotos.length) {
    return `No se puede enviar: faltan fotos de referencia de ${dto.faltanFotos.join(", ")}. Agrégalas en el Catálogo.`;
  }
  return null;
}

export async function marcarEnviada(
  organizationId: string,
  id: string,
  canal: "whatsapp" | "correo",
  detalle: Record<string, unknown>
): Promise<void> {
  const db = getDb();
  const [cot] = await db
    .select({ envios: schema.cotizacion.envios })
    .from(schema.cotizacion)
    .where(and(eq(schema.cotizacion.organizationId, organizationId), eq(schema.cotizacion.id, id)))
    .limit(1);
  const envios = { ...(cot?.envios ?? {}), [canal]: { ...detalle, fecha: new Date().toISOString() } };
  await db
    .update(schema.cotizacion)
    .set({ estado: "enviada", envios, enviadaAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.cotizacion.organizationId, organizationId), eq(schema.cotizacion.id, id)));
}
