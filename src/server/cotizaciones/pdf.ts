import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getDb, schema } from "@/lib/db";
import { formatoPesos, numeroCotizacion, type CotizacionDto } from "@/lib/cotizaciones";
import { readMediaFile } from "@/server/whatsapp/media";
import { CLAVES, deFicha } from "./index";

/**
 * Petrominal — PDF de la cotización (carta, Helvetica). Cada renglón lleva la
 * foto de referencia del producto: por eso el envío exige que todos la tengan.
 */

const AZUL = rgb(0.06, 0.3, 0.65);
const GRIS = rgb(0.35, 0.35, 0.38);
const LINEA = rgb(0.85, 0.87, 0.9);

/** Helvetica estándar solo dibuja WinAnsi: lo demás se cambia por «?». */
function seguro(t: string): string {
  return t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-")
    .replace(/[^\x20-\x7E -ÿ—•€]/g, "?");
}

function envolver(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  const palabras = seguro(texto).split(/\s+/);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (font.widthOfTextAtSize(prueba, size) <= ancho) actual = prueba;
    else {
      if (actual) lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

async function fotoDe(doc: PDFDocument, organizationId: string, productoId: string | null): Promise<PDFImage | null> {
  if (!productoId) return null;
  const [p] = await getDb()
    .select({ mime: schema.producto.fotoMime })
    .from(schema.producto)
    .where(eq(schema.producto.id, productoId))
    .limit(1);
  if (!p?.mime) return null;
  try {
    const data = await readMediaFile(organizationId, `${productoId}-foto`);
    return p.mime === "image/png" ? await doc.embedPng(data) : await doc.embedJpg(data);
  } catch {
    return null;
  }
}

async function logo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const data = await readFile(path.join(process.cwd(), "public", "petrominal-logo.png"));
    return await doc.embedPng(data);
  } catch {
    return null;
  }
}

export async function generarPdfCotizacion(organizationId: string, cot: CotizacionDto): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Cotización ${numeroCotizacion(cot.numero)} — Petrominal S.A.S.`);
  doc.setAuthor("Petrominal S.A.S.");
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const imgLogo = await logo(doc);

  const [contacto] = await getDb()
    .select({ ficha: schema.contact.ficha })
    .from(schema.contact)
    .where(eq(schema.contact.id, cot.contacto.id))
    .limit(1);
  const ficha = contacto?.ficha;

  const W = 612;
  const H = 792;
  const M = 40;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const texto = (t: string, x: number, yy: number, size = 9, font = f, color = rgb(0.1, 0.1, 0.12)) =>
    page.drawText(seguro(t), { x, y: yy, size, font, color });

  // Encabezado
  if (imgLogo) {
    const alto = 62;
    const ancho = (imgLogo.width / imgLogo.height) * alto;
    page.drawImage(imgLogo, { x: M, y: y - alto, width: ancho, height: alto });
  }
  texto("COTIZACIÓN", W - M - fb.widthOfTextAtSize("COTIZACIÓN", 18), y - 16, 18, fb, AZUL);
  const num = numeroCotizacion(cot.numero);
  texto(num, W - M - fb.widthOfTextAtSize(num, 12), y - 34, 12, fb);
  const fecha = new Date(cot.enviadaAt ?? cot.createdAt).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
  texto(`Fecha: ${fecha}`, W - M - f.widthOfTextAtSize(seguro(`Fecha: ${fecha}`), 9), y - 50, 9, f, GRIS);
  const validez = `Validez: ${cot.validezDias} días`;
  texto(validez, W - M - f.widthOfTextAtSize(validez, 9), y - 62, 9, f, GRIS);
  y -= 80;
  texto("PETROMINAL S.A.S. — Soluciones en izaje y amarre de carga · www.petrominal.com", M, y, 8.5, f, GRIS);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: AZUL });
  y -= 18;

  // Cliente y asesor
  const col2 = W / 2 + 10;
  texto("CLIENTE", M, y, 8, fb, AZUL);
  texto("ASESOR COMERCIAL", col2, y, 8, fb, AZUL);
  y -= 13;
  const datosCliente = [
    cot.contacto.nombre,
    cot.contacto.empresa ?? deFicha(ficha, CLAVES.empresa),
    deFicha(ficha, CLAVES.nit) ? `NIT: ${deFicha(ficha, CLAVES.nit)}` : null,
    deFicha(ficha, CLAVES.ciudad),
    cot.contacto.correo,
    cot.contacto.telefono ? `Tel: +${cot.contacto.telefono}` : null,
  ].filter((x): x is string => !!x);
  const datosAsesor = [cot.asesor?.nombre ?? "Petrominal S.A.S.", cot.asesor?.email ?? null].filter(
    (x): x is string => !!x
  );
  const filas = Math.max(datosCliente.length, datosAsesor.length);
  for (let i = 0; i < filas; i++) {
    if (datosCliente[i]) texto(datosCliente[i]!, M, y, 9.5, i === 0 ? fb : f);
    if (datosAsesor[i]) texto(datosAsesor[i]!, col2, y, 9.5, i === 0 ? fb : f);
    y -= 13;
  }
  y -= 8;

  // Tabla
  const cols = { foto: M, ref: M + 54, desc: M + 124, cant: W - M - 200, unit: W - M - 140, total: W - M - 70 };
  const encabezado = () => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 18, color: AZUL });
    const blanco = rgb(1, 1, 1);
    texto("Foto", cols.foto + 4, y + 1, 8, fb, blanco);
    texto("Referencia", cols.ref, y + 1, 8, fb, blanco);
    texto("Descripción", cols.desc, y + 1, 8, fb, blanco);
    texto("Cant.", cols.cant, y + 1, 8, fb, blanco);
    texto("Vr. unitario", cols.unit, y + 1, 8, fb, blanco);
    texto("Total", cols.total, y + 1, 8, fb, blanco);
    y -= 22;
  };
  encabezado();

  const derecha = (t: string, xFin: number, yy: number, size = 9, font = f) =>
    texto(t, xFin - font.widthOfTextAtSize(seguro(t), size), yy, size, font);

  for (const item of cot.items) {
    const lineas = envolver(item.descripcion, f, 8.5, cols.cant - cols.desc - 8);
    const alto = Math.max(48, lineas.length * 11 + 8);
    if (y - alto < M + 120) {
      page = doc.addPage([W, H]);
      y = H - M;
      encabezado();
    }
    const img = await fotoDe(doc, organizationId, item.productoId);
    if (img) {
      const lado = 42;
      const escala = Math.min(lado / img.width, lado / img.height);
      page.drawImage(img, {
        x: cols.foto + (lado - img.width * escala) / 2 + 2,
        y: y - lado + 8 + (lado - img.height * escala) / 2,
        width: img.width * escala,
        height: img.height * escala,
      });
    }
    texto(item.referencia, cols.ref, y, 8.5, fb);
    lineas.forEach((l, i) => texto(l, cols.desc, y - i * 11, 8.5));
    const cant = `${item.cantidad.toLocaleString("es-CO")} ${item.unidad}`;
    texto(cant, cols.cant, y, 8.5);
    derecha(formatoPesos(item.precioUnitario, cot.moneda), cols.total - 8, y, 8.5);
    derecha(formatoPesos(item.cantidad * item.precioUnitario, cot.moneda), W - M, y, 8.5, fb);
    y -= alto;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: LINEA });
  }

  // Totales
  y -= 6;
  const filaTotal = (etiqueta: string, valor: number, negrita = false) => {
    derecha(etiqueta, W - M - 110, y, 10, negrita ? fb : f);
    derecha(formatoPesos(valor, cot.moneda), W - M, y, 10, negrita ? fb : f);
    y -= 15;
  };
  filaTotal("Subtotal", cot.subtotal);
  filaTotal(`IVA (${cot.ivaPorcentaje}%)`, cot.iva);
  filaTotal("TOTAL", cot.total, true);
  y -= 10;

  const bloque = (titulo: string, cuerpo: string | null) => {
    if (!cuerpo?.trim()) return;
    if (y < M + 60) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
    texto(titulo, M, y, 8.5, fb, AZUL);
    y -= 12;
    for (const l of envolver(cuerpo, f, 8.5, W - 2 * M)) {
      texto(l, M, y, 8.5, f, GRIS);
      y -= 11;
    }
    y -= 6;
  };
  bloque("CONDICIONES COMERCIALES", cot.condiciones);
  bloque("OBSERVACIONES", cot.notas);

  return Buffer.from(await doc.save());
}
