import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { getDb, schema } from "@/lib/db";
import { formatoPesos, numeroCotizacion, type CotizacionDto } from "@/lib/cotizaciones";
import { readMediaFile } from "@/server/whatsapp/media";

/**
 * Petrominal — PDF de la cotización con la plantilla oficial (carta):
 *
 *   encabezado (logo + NIT · franja naranja con la razón social · logo NovaSling)
 *   CLIENTE | COTIZACIÓN
 *   tabla Item · Ref. · Descripción · Cant. · Unid. · Días entrega · Vr. Unitario · Total
 *   fotos de referencia (en el espacio libre, o en un anexo)
 *   CONDICIONES COMERCIALES | Subtotal · Dcto. · Base · IVA · TOTAL
 *   NOTA · OBSERVACIONES
 *   pie azul con teléfonos, dirección, correo y web (en cada página)
 *
 * El bloque de condiciones va anclado al pie de la última página de la tabla.
 * Cada renglón lleva foto de referencia: por eso el envío exige que todos la tengan.
 */

const EMPRESA = {
  razonSocial: "COMERCIALIZADORA INDUSTRIAL PETROLERA, MINERA Y NAVAL",
  razonSocial2: "S.A.S. — PETROMINAL S.A.S.",
  eslogan: "Soluciones en Izaje y Sujeción de Carga",
  nit: "900.405.736-6",
  telefonos: "(60-5) 327 0434 - 3183960911",
  direccion: "Vía 40 #71 - 197 - Bodega 202 Centro Industrial Marysol",
  correo: "info@petrominal.com",
  web: "www.petrominal.com",
};

const NARANJA = rgb(0.95, 0.24, 0.05);
const AZUL_OSCURO = rgb(0.04, 0.09, 0.2);
const CELESTE = rgb(0.0, 0.69, 0.92);
const GRIS = rgb(0.4, 0.42, 0.46);
const GRIS_FONDO = rgb(0.94, 0.95, 0.96);
const LINEA = rgb(0.84, 0.86, 0.89);
const TINTA = rgb(0.13, 0.14, 0.17);
const BLANCO = rgb(1, 1, 1);

const W = 612;
const H = 792;
const M = 24;
const ANCHO = W - 2 * M;

/** Alturas del pie y del bloque final (condiciones + nota + observaciones). */
const ALTO_PIE = 56;
const ALTO_CONDICIONES = 118;
const ALTO_NOTA = 40;
const ALTO_OBS = 40;
const BLOQUE_FINAL = ALTO_CONDICIONES + ALTO_NOTA + ALTO_OBS + 6;
const FILAS_MINIMAS = 5;

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
  while (lineas.length > 1 && !lineas[lineas.length - 1]) lineas.pop();
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

/** Un PNG de `public/`; si no está, la plantilla se dibuja sin él. */
async function imagenPublica(doc: PDFDocument, archivo: string): Promise<PDFImage | null> {
  try {
    const data = await readFile(path.join(process.cwd(), "public", archivo));
    return await doc.embedPng(data);
  } catch {
    return null;
  }
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

function cantidadTexto(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 3 });
}

export async function generarPdfCotizacion(organizationId: string, cot: CotizacionDto): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const num = numeroCotizacion(cot.numero);
  doc.setTitle(`Cotización ${num} — Petrominal S.A.S.`);
  doc.setAuthor("Petrominal S.A.S.");
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const fbi = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const imgLogo = await imagenPublica(doc, "petrominal-logo.png");
  const imgNova = await imagenPublica(doc, "novasling-logo.png");

  let page: PDFPage = doc.addPage([W, H]);

  // ---------- primitivas ----------
  const texto = (t: string, x: number, y: number, size = 7.5, font = f, color: RGB = TINTA) =>
    page.drawText(seguro(t), { x, y, size, font, color });
  const ancho = (t: string, size: number, font = f) => font.widthOfTextAtSize(seguro(t), size);
  const derecha = (t: string, xFin: number, y: number, size = 7.5, font = f, color: RGB = TINTA) =>
    texto(t, xFin - ancho(t, size, font), y, size, font, color);
  const centro = (t: string, x0: number, x1: number, y: number, size = 7.5, font = f, color: RGB = TINTA) =>
    texto(t, (x0 + x1) / 2 - ancho(t, size, font) / 2, y, size, font, color);
  const rect = (x: number, y: number, w: number, h: number, color?: RGB, borde?: RGB) =>
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      ...(color ? { color } : {}),
      ...(borde ? { borderColor: borde, borderWidth: 0.6 } : {}),
    });
  const linea = (x0: number, y0: number, x1: number, y1: number, color: RGB = LINEA, grosor = 0.6) =>
    page.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: grosor, color });
  const imagenEnCaja = (img: PDFImage, x: number, y: number, w: number, h: number) => {
    const e = Math.min(w / img.width, h / img.height);
    page.drawImage(img, {
      x: x + (w - img.width * e) / 2,
      y: y + (h - img.height * e) / 2,
      width: img.width * e,
      height: img.height * e,
    });
  };

  // ---------- pie (cada página) ----------
  const pie = () => {
    rect(M, M, ANCHO, ALTO_PIE, AZUL_OSCURO);
    const fila = `Tel. ${EMPRESA.telefonos}     ·     ${EMPRESA.direccion}     ·     ${EMPRESA.correo}`;
    centro(fila, M, W - M, M + ALTO_PIE - 20, 8, fb, BLANCO);
    const wWeb = ancho(EMPRESA.web, 8.5, fb) + 36;
    page.drawRectangle({
      x: W / 2 - wWeb / 2,
      y: M,
      width: wWeb,
      height: 18,
      color: NARANJA,
    });
    centro(EMPRESA.web, M, W - M, M + 6, 8.5, fb, BLANCO);
  };

  // ---------- encabezado (primera página) ----------
  let y = H - M;
  const ALTO_ENC = 62;
  const xBanda0 = M + 150;
  const xBanda1 = W - M - 118;
  if (imgLogo) imagenEnCaja(imgLogo, M + 20, y - 44, 110, 38);
  centro(`NIT: ${EMPRESA.nit}`, M, xBanda0, y - 54, 7, fb);
  rect(xBanda0, y - ALTO_ENC - 4, xBanda1 - xBanda0, ALTO_ENC + 4, NARANJA);
  centro(EMPRESA.razonSocial, xBanda0, xBanda1, y - 22, 8, fb, BLANCO);
  centro(EMPRESA.razonSocial2, xBanda0, xBanda1, y - 32, 8, fb, BLANCO);
  centro(EMPRESA.eslogan, xBanda0, xBanda1, y - 43, 6.5, f, BLANCO);
  if (imgNova) imagenEnCaja(imgNova, xBanda1 + 12, y - 50, W - M - xBanda1 - 24, 40);
  y -= ALTO_ENC + 4;

  // ---------- CLIENTE | COTIZACIÓN ----------
  const xMitad = M + ANCHO * 0.47;
  rect(M, y - 14, ANCHO, 14, GRIS_FONDO);
  linea(M, y - 14, W - M, y - 14);
  centro("CLIENTE", M, xMitad, y - 10, 7.5, fbi);
  centro("COTIZACIÓN", xMitad, W - M, y - 10, 7.5, fbi);
  y -= 26;
  const yInicioDatos = y + 8;

  const c = cot.contacto;
  const datosCliente: [string, string | null][] = [
    ["Cliente", c.empresa ?? c.nombre],
    ["NIT / C.C.", c.nit],
    ["Dirección", c.direccion],
    ["Contacto", c.empresa ? c.nombre : null],
    ["Correo", c.correo],
    ["Tel", c.telefono ? `+${c.telefono}` : null],
    ["Ciudad", c.ciudad],
  ];
  const xValor = M + 75;
  let yCli = y;
  for (const [etiqueta, valor] of datosCliente) {
    texto(etiqueta, M + 8, yCli, 6.8, fb, GRIS);
    const lineas = envolver(valor ?? "", f, 7.3, xMitad - xValor - 8).slice(0, 2);
    lineas.forEach((l, k) => texto(l, xValor, yCli - k * 9, 7.3));
    yCli -= 12.5 + (lineas.length - 1) * 9;
  }

  const xEtq = xMitad + 8;
  const xVal = xMitad + 75;
  let yCot = y;
  texto("Número", xEtq, yCot, 6.8, fb, GRIS);
  texto(num, xVal, yCot - 1, 11, fb, AZUL_OSCURO);
  yCot -= 15;
  texto("Fecha", xEtq, yCot, 6.8, fb, GRIS);
  texto(fechaCorta(cot.enviadaAt ?? cot.createdAt), xVal, yCot, 7.3);
  yCot -= 12.5;
  texto("Solicitud", xEtq, yCot, 6.8, fb, GRIS);
  for (const l of envolver(cot.solicitud ?? "", f, 7.3, W - M - xVal - 6).slice(0, 4)) {
    texto(l, xVal, yCot, 7.3);
    yCot -= 10;
  }
  y = Math.min(yCli, yCot) - 2;
  linea(xMitad, yInicioDatos + 6, xMitad, y + 6);
  linea(M, y + 4, W - M, y + 4);
  y -= 8;
  centro(
    "En atención a su solicitud de cotización nos permitimos ofertarles lo siguiente:",
    M,
    W - M,
    y,
    7.3,
    fbi
  );
  y -= 8;

  // ---------- tabla ----------
  const anchos = [28, 64, 196, 38, 40, 56, 66, 76];
  const titulos = ["Item", "Ref.", "Descripción", "Cant.", "Unid.", "Días entrega", "Vr. Unitario", "Total"];
  const xs: number[] = [];
  let xAcum = M;
  for (const w of anchos) {
    xs.push(xAcum);
    xAcum += w;
  }
  const xFin = (i: number) => (xs[i] ?? M) + (anchos[i] ?? 0);

  const encabezadoTabla = () => {
    rect(M, y - 16, ANCHO, 16, AZUL_OSCURO);
    titulos.forEach((t, i) => centro(t, xs[i] ?? M, xFin(i), y - 11, 7, fb, BLANCO));
    y -= 16;
  };
  encabezadoTabla();

  const limiteConBloque = M + ALTO_PIE + BLOQUE_FINAL + 8;
  const limiteSinBloque = M + ALTO_PIE + 10;
  const SIZE = 7;
  const INTER = 9;

  type Fila = { item: CotizacionDto["items"][number] | null; n: number; lineas: string[]; alto: number };
  const filas: Fila[] = [];
  cot.items.forEach((item, i) => {
    const lineas = envolver(item.descripcion, f, SIZE, anchos[2]! - 10);
    filas.push({ item, n: i + 1, lineas, alto: Math.max(22, lineas.length * INTER + 10) });
  });
  for (let n = filas.length + 1; n <= FILAS_MINIMAS; n++) filas.push({ item: null, n, lineas: [], alto: 22 });

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i]!;
    const restante = filas.slice(i).reduce((s, r) => s + r.alto, 0);
    // Si todo lo que falta cabe con el bloque final, se queda; si no, la fila
    // cabe sin el bloque o salta de página.
    const cabeConBloque = y - restante >= limiteConBloque;
    if (!cabeConBloque && y - fila.alto < limiteSinBloque) {
      pie();
      page = doc.addPage([W, H]);
      y = H - M;
      encabezadoTabla();
    }
    const yTop = y;
    const yBase = y - fila.alto;
    rect(M, yBase, ANCHO, fila.alto, undefined, LINEA);
    xs.slice(1).forEach((x) => linea(x, yBase, x, yTop));
    const yTexto = yTop - 10 - Math.max(0, (fila.alto - 10 - fila.lineas.length * INTER) / 2 - 2);
    const yMedio = yBase + fila.alto / 2 - 2.5;
    centro(String(fila.n), xs[0]!, xFin(0), yMedio, SIZE, fb);
    if (fila.item) {
      const it = fila.item;
      centro(it.referencia, xs[1]!, xFin(1), yMedio, SIZE);
      fila.lineas.forEach((l, k) => texto(l, xs[2]! + 5, yTexto - k * INTER, SIZE));
      centro(cantidadTexto(it.cantidad), xs[3]!, xFin(3), yMedio, SIZE);
      centro((it.unidad || "und").toLowerCase(), xs[4]!, xFin(4), yMedio, SIZE);
      if (it.diasEntrega) centro(it.diasEntrega, xs[5]!, xFin(5), yMedio, SIZE);
      derecha(formatoPesos(it.precioUnitario, cot.moneda), xFin(6) - 6, yMedio, SIZE);
      derecha(formatoPesos(it.cantidad * it.precioUnitario, cot.moneda), xFin(7) - 6, yMedio, SIZE);
    } else {
      centro("und", xs[4]!, xFin(4), yMedio, SIZE, f, GRIS);
      derecha(formatoPesos(0, cot.moneda), xFin(7) - 6, yMedio, SIZE, f, GRIS);
    }
    y = yBase;
  }

  // ---------- fotos de referencia ----------
  const fotos: { ref: string; img: PDFImage }[] = [];
  for (const it of cot.items) {
    if (fotos.some((x) => x.ref === it.referencia)) continue;
    const img = await fotoDe(doc, organizationId, it.productoId);
    if (img) fotos.push({ ref: it.referencia, img });
  }
  const CELDA = 78;
  const SEP = 10;
  const porFila = Math.floor((ANCHO + SEP) / (CELDA + SEP));
  const altoFotos = (n: number) => 16 + Math.ceil(n / porFila) * (CELDA + 14);
  const dibujarFotos = (lista: typeof fotos, yTop: number) => {
    texto("FOTOS DE REFERENCIA", M, yTop - 10, 7, fb, NARANJA);
    lista.forEach((ft, k) => {
      const col = k % porFila;
      const filaN = Math.floor(k / porFila);
      const x = M + col * (CELDA + SEP);
      const yCaja = yTop - 16 - filaN * (CELDA + 14) - CELDA;
      rect(x, yCaja, CELDA, CELDA, undefined, LINEA);
      imagenEnCaja(ft.img, x + 3, yCaja + 3, CELDA - 6, CELDA - 6);
      centro(ft.ref, x, x + CELDA, yCaja - 9, 6.5, fb, GRIS);
    });
  };
  const yBloque = M + ALTO_PIE + 6 + BLOQUE_FINAL;
  const fotosEnHoja = fotos.length > 0 && y - 10 - altoFotos(fotos.length) >= yBloque;
  if (fotosEnHoja) dibujarFotos(fotos, y - 6);

  // ---------- CONDICIONES COMERCIALES | totales ----------
  let yb = yBloque;
  const xTot = M + ANCHO * 0.6;
  linea(M, yb, W - M, yb);
  linea(xTot, yb, xTot, yb - ALTO_CONDICIONES);
  texto("CONDICIONES COMERCIALES", M + 10, yb - 13, 7.5, fb, NARANJA);

  // Zona franca · Tarifa IVA · Dcto.
  const yZf = yb - 32;
  rect(M + 30, yZf - 2, 9, 9, BLANCO, GRIS);
  if (cot.zonaFranca) {
    linea(M + 31.5, yZf - 0.5, M + 37.5, yZf + 5.5, TINTA, 1.2);
    linea(M + 31.5, yZf + 5.5, M + 37.5, yZf - 0.5, TINTA, 1.2);
  }
  let xz = M + 46;
  texto("Zona franca (IVA exento)", xz, yZf, 8.5, fb);
  xz += ancho("Zona franca (IVA exento)", 8.5, fb) + 14;
  texto("Tarifa IVA:", xz, yZf, 7, fb);
  xz += ancho("Tarifa IVA:", 7, fb) + 8;
  const ivaTxt = cot.zonaFranca ? "0" : String(cot.ivaPorcentaje);
  texto(ivaTxt, xz, yZf - 0.5, 9.5, fb, NARANJA);
  xz += ancho(ivaTxt, 9.5, fb) + 8;
  texto("%", xz, yZf, 7, fb);
  xz += 18;
  texto("Dcto.:", xz, yZf, 7, fb);
  xz += ancho("Dcto.:", 7, fb) + 8;
  texto(String(cot.descuentoPorcentaje), xz, yZf - 0.5, 9.5, fb, NARANJA);
  xz += ancho(String(cot.descuentoPorcentaje), 9.5, fb) + 8;
  texto("%", xz, yZf, 7, fb);
  linea(M + 10, yZf - 7, xTot - 12, yZf - 7, NARANJA, 1.5);

  let yc = yZf - 20;
  const xc = M + 102;
  const anchoC = xTot - xc - 12;
  const condicion = (etiqueta: string, valor: string) => {
    texto(etiqueta, M + 10, yc, 6.8, fb, GRIS);
    const ls = envolver(valor, f, 7.3, anchoC).slice(0, 2);
    ls.forEach((l, k) => texto(l, xc, yc - k * 9, 7.3));
    yc -= Math.max(12, ls.length * 9 + 3);
  };
  condicion("Forma / cond. pago", cot.formaPago ?? "");
  condicion("Lugar de entrega", cot.lugarEntrega ?? "");
  condicion("Validez oferta", `${cot.validezDias} DÍAS`);

  const yAsesor = yb - ALTO_CONDICIONES + 16;
  for (let x = M + 10; x < xTot - 12; x += 5) linea(x, yAsesor + 10, x + 2.5, yAsesor + 10, LINEA, 0.6);
  texto(cot.asesor?.nombre ?? "Equipo comercial", M + 10, yAsesor, 7.8, fb);
  texto(
    ["ASESOR COMERCIAL", cot.asesor?.email].filter(Boolean).join(" · "),
    M + 10,
    yAsesor - 9,
    6.3,
    f,
    GRIS
  );

  // Totales
  const xEt0 = xTot;
  const xEt1 = xTot + (W - M - xTot) * 0.55;
  let yt = yb - 30;
  const filaTot = (etiqueta: string, valor: string, final = false) => {
    const h = final ? 17 : 15;
    rect(xEt0, yt - h, xEt1 - xEt0, h, final ? AZUL_OSCURO : CELESTE);
    linea(xEt1, yt - h, W - M, yt - h);
    centro(etiqueta, xEt0, xEt1, yt - h + 5, final ? 8.5 : 7.2, fb, final ? BLANCO : AZUL_OSCURO);
    derecha(valor, W - M - 6, yt - h + 5, final ? 9.5 : 7.5, fb);
    yt -= h + 1.5;
  };
  filaTot("Subtotal", formatoPesos(cot.subtotal, cot.moneda));
  filaTot(`Dcto. (${cot.descuentoPorcentaje}%)`, formatoPesos(cot.descuento, cot.moneda));
  filaTot("Base", formatoPesos(cot.base, cot.moneda));
  filaTot(cot.zonaFranca ? "IVA (exento)" : `Más IVA (${cot.ivaPorcentaje}%)`, formatoPesos(cot.iva, cot.moneda));
  filaTot("TOTAL", formatoPesos(cot.total, cot.moneda), true);

  // NOTA y OBSERVACIONES
  yb -= ALTO_CONDICIONES;
  const recuadro = (titulo: string, cuerpo: string, alto: number) => {
    rect(M, yb - alto, ANCHO, alto, GRIS_FONDO);
    linea(M, yb, W - M, yb);
    texto(titulo, M + 8, yb - 10, 6.8, fb);
    envolver(cuerpo, f, 6.8, ANCHO - 20)
      .slice(0, 3)
      .forEach((l, k) => texto(l, M + 10, yb - 20 - k * 8.5, 6.8));
    yb -= alto;
  };
  recuadro("NOTA:", cot.condiciones ?? "", ALTO_NOTA);
  recuadro("OBSERVACIONES:", cot.notas ?? "", ALTO_OBS);
  pie();

  // ---------- anexo de fotos si no cupieron ----------
  if (fotos.length && !fotosEnHoja) {
    const porHoja = Math.max(porFila, Math.floor((H - 2 * M - ALTO_PIE - 40) / (CELDA + 14)) * porFila);
    for (let k = 0; k < fotos.length; k += porHoja) {
      page = doc.addPage([W, H]);
      texto(`Cotización ${num} — anexo`, M, H - M - 10, 8, fb, AZUL_OSCURO);
      dibujarFotos(fotos.slice(k, k + porHoja), H - M - 18);
      pie();
    }
  }

  return Buffer.from(await doc.save());
}
