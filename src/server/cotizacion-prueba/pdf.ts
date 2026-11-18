import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatoPesos } from "@/lib/cotizaciones";
import { IVA_PRUEBA, totalesPrueba, type PlantillaPrueba } from "@/lib/cotizacion-prueba";

/**
 * Syrtel — PDF de la cotización de PRUEBA (carta). Marca de Syrtel Solutions,
 * productos ficticios del nicho, marca de agua «EJEMPLO» y la aclaración de que
 * no es una oferta. El logo se dibuja con trazos (el mismo del sitio web), sin
 * archivos de imagen.
 */

const TINTA = rgb(0.08, 0.1, 0.09);
const PAPEL = rgb(0.984, 0.976, 0.957);
const COBRE = rgb(0.886, 0.357, 0.086);
const DURAZNO = rgb(0.941, 0.761, 0.643);
const GRIS = rgb(0.4, 0.42, 0.42);
const LINEA = rgb(0.86, 0.87, 0.86);
const FONDO = rgb(0.96, 0.96, 0.95);
const BLANCO = rgb(1, 1, 1);

const W = 612;
const H = 792;
const M = 36;

/** Helvetica estándar solo dibuja WinAnsi: lo demás se cambia por «?». */
function seguro(t: string): string {
  return t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-")
    .replace(/[^\x20-\x7E -ÿ—•€]/g, "?");
}

function envolver(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of seguro(texto).split(/\r?\n/)) {
    let actual = "";
    for (const p of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (font.widthOfTextAtSize(prueba, size) <= ancho) actual = prueba;
      else {
        if (actual) lineas.push(actual);
        actual = p;
      }
    }
    lineas.push(actual);
  }
  return lineas;
}

function texto(page: PDFPage, t: string, x: number, y: number, font: PDFFont, size: number, color = TINTA) {
  page.drawText(seguro(t), { x, y, font, size, color });
}

function derecha(page: PDFPage, t: string, xDer: number, y: number, font: PDFFont, size: number, color = TINTA) {
  const s = seguro(t);
  page.drawText(s, { x: xDer - font.widthOfTextAtSize(s, size), y, font, size, color });
}

/** Marca de Syrtel (globo de chat + trazo cobre) con su esquina superior izquierda en (x, y). */
function logo(page: PDFPage, x: number, y: number, bold: PDFFont, regular: PDFFont) {
  const s = 0.62;
  page.drawSvgPath(
    "M18 5 H46 A13 13 0 0 1 59 18 V36 A13 13 0 0 1 46 49 H22 L10 58 V47.2 A13 13 0 0 1 5 36 V18 A13 13 0 0 1 18 5 Z",
    { x, y, scale: s, borderColor: PAPEL, borderWidth: 3.6 * s }
  );
  page.drawSvgPath("M18 38 L37 19", { x, y, scale: s, borderColor: COBRE, borderWidth: 3.6 * s });
  page.drawCircle({ x: x + 43 * s, y: y - 13.5 * s, size: 4 * s, color: COBRE });
  const base = y - 30;
  page.drawText("Syrtel", { x: x + 46, y: base, font: bold, size: 20, color: PAPEL });
  page.drawText("Solutions", {
    x: x + 46 + bold.widthOfTextAtSize("Syrtel", 20) + 4,
    y: base,
    font: regular,
    size: 20,
    color: DURAZNO,
  });
}

export type DatosPrueba = {
  numero: string;
  fecha: Date;
  cliente: { nombre: string; empresa: string | null; correo: string | null };
  plantilla: PlantillaPrueba;
};

export async function generarPdfPrueba(d: DatosPrueba): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Cotización de ejemplo ${d.numero} — Syrtel CRM`);
  doc.setAuthor("Syrtel Solutions");
  doc.setCreator("Syrtel CRM");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([W, H]);

  // Marca de agua, debajo de todo.
  page.drawText("EJEMPLO", {
    x: 120,
    y: 230,
    font: bold,
    size: 110,
    color: rgb(0.93, 0.93, 0.92),
    rotate: degrees(35),
  });

  // Encabezado oscuro con el logo y el título.
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: TINTA });
  logo(page, M, H - 26, bold, regular);
  derecha(page, "COTIZACIÓN DE EJEMPLO", W - M, H - 44, bold, 13, PAPEL);
  const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" }).format(d.fecha);
  derecha(page, `${d.numero} · ${fecha}`, W - M, H - 62, regular, 9.5, DURAZNO);
  page.drawRectangle({ x: 0, y: H - 100, width: W, height: 4, color: COBRE });

  // Para quién.
  let y = H - 132;
  texto(page, "PREPARADA PARA", M, y, bold, 8, GRIS);
  texto(page, "TIPO DE NEGOCIO", W / 2 + 10, y, bold, 8, GRIS);
  y -= 16;
  texto(page, d.cliente.nombre, M, y, bold, 12);
  texto(page, d.plantilla.titulo, W / 2 + 10, y, bold, 12);
  y -= 15;
  const sub = [d.cliente.empresa, d.cliente.correo].filter(Boolean).join(" · ");
  if (sub) texto(page, sub, M, y, regular, 9.5, GRIS);
  texto(page, "Productos y valores de ejemplo", W / 2 + 10, y, regular, 9.5, GRIS);

  // Tabla.
  y -= 34;
  const cols = { img: M, ref: M + 46, desc: M + 104, cant: 392, unid: 428, unit: 506, total: W - M };
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: TINTA });
  const th = (t: string, x: number) => texto(page, t, x, y + 1, bold, 8.5, PAPEL);
  th("Imagen", cols.img + 4);
  th("Ref.", cols.ref);
  th("Descripción", cols.desc);
  derecha(page, "Cant.", cols.cant + 16, y + 1, bold, 8.5, PAPEL);
  th("Unid.", cols.unid);
  derecha(page, "Vr. unitario", cols.unit, y + 1, bold, 8.5, PAPEL);
  derecha(page, "Total", cols.total - 6, y + 1, bold, 8.5, PAPEL);
  y -= 12;

  const tonos = [COBRE, rgb(0.13, 0.45, 0.4), rgb(0.2, 0.36, 0.7), rgb(0.55, 0.36, 0.65)];
  d.plantilla.items.forEach((it, i) => {
    const alto = 48;
    const top = y;
    if (i % 2 === 1) page.drawRectangle({ x: M, y: top - alto, width: W - 2 * M, height: alto, color: FONDO });
    // Imagen de referencia: una ficha de color con la inicial del producto.
    const tono = tonos[i % tonos.length] ?? COBRE;
    page.drawRectangle({ x: cols.img + 4, y: top - alto + 7, width: 34, height: 34, color: tono, opacity: 0.85 });
    const ini = seguro(it.descripcion.charAt(0).toUpperCase());
    page.drawText(ini, {
      x: cols.img + 4 + 17 - bold.widthOfTextAtSize(ini, 16) / 2,
      y: top - alto + 18,
      font: bold,
      size: 16,
      color: BLANCO,
    });
    const medio = top - alto / 2 - 3;
    texto(page, it.referencia, cols.ref, medio, regular, 9);
    const lineas = envolver(it.descripcion, regular, 9.5, cols.cant - cols.desc - 24);
    lineas.slice(0, 2).forEach((l, k) => texto(page, l, cols.desc, medio + (lineas.length > 1 ? 6 - k * 12 : 0), regular, 9.5));
    derecha(page, String(it.cantidad), cols.cant + 16, medio, regular, 9.5);
    texto(page, it.unidad, cols.unid, medio, regular, 9.5);
    derecha(page, formatoPesos(it.precio, "COP"), cols.unit, medio, regular, 9.5);
    derecha(page, formatoPesos(it.precio * it.cantidad, "COP"), cols.total - 6, medio, bold, 9.5);
    page.drawLine({ start: { x: M, y: top - alto }, end: { x: W - M, y: top - alto }, thickness: 0.6, color: LINEA });
    y -= alto;
  });

  // Totales.
  const t = totalesPrueba(d.plantilla.items);
  y -= 22;
  const fila = (etq: string, valor: number, fuerte = false) => {
    texto(page, etq, 380, y, fuerte ? bold : regular, fuerte ? 11 : 10, fuerte ? TINTA : GRIS);
    derecha(page, formatoPesos(valor, "COP"), W - M - 6, y, fuerte ? bold : regular, fuerte ? 11 : 10);
    y -= 18;
  };
  fila("Subtotal", t.subtotal);
  fila(`IVA ${Math.round(IVA_PRUEBA * 100)} %`, t.iva);
  page.drawLine({ start: { x: 380, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 1, color: TINTA });
  y -= 2;
  fila("TOTAL", t.total, true);

  // Aclaración.
  y -= 18;
  const nota =
    "Esta es una cotización de EJEMPLO generada automáticamente por Syrtel CRM para mostrarle cómo recibirían sus clientes una cotización: con su logo, imágenes de los productos, totales con IVA y envío por WhatsApp y correo. Los productos y los valores son ficticios; no es una oferta comercial ni el precio de Syrtel CRM.";
  const lineasNota = envolver(nota, regular, 9.5, W - 2 * M - 28);
  const altoNota = 26 + lineasNota.length * 13;
  page.drawRectangle({ x: M, y: y - altoNota, width: W - 2 * M, height: altoNota, color: FONDO, borderColor: COBRE, borderWidth: 1 });
  texto(page, "IMPORTANTE", M + 14, y - 18, bold, 8.5, COBRE);
  lineasNota.forEach((l, k) => texto(page, l, M + 14, y - 33 - k * 13, regular, 9.5));

  // Pie.
  page.drawRectangle({ x: 0, y: 0, width: W, height: 44, color: TINTA });
  texto(page, "Syrtel Solutions · syrtelsolutions.com", M, 18, bold, 9.5, PAPEL);
  derecha(page, "Generada con Syrtel CRM · API oficial de Meta", W - M, 18, regular, 9, DURAZNO);

  return Buffer.from(await doc.save());
}
