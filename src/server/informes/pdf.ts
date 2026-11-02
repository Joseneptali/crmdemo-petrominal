import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatoPesos } from "@/lib/cotizaciones";
import type { Informe } from "./index";

/** Petrominal — informe gerencial en PDF (carta), con gráficos de barras. */

const AZUL = rgb(0.06, 0.3, 0.65);
const GRIS = rgb(0.35, 0.35, 0.38);
const SUAVE = rgb(0.93, 0.95, 0.98);

const seguro = (t: string) => t.replace(/[^\x20-\x7E -ÿ—•]/g, "?");

function fecha(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" }).format(new Date(iso));
}

export async function generarPdfInforme(inf: Informe): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle("Informe gerencial — Petrominal S.A.S.");
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612;
  const H = 792;
  const M = 40;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const t = (s: string, x: number, yy: number, size = 9, font: PDFFont = f, color = rgb(0.1, 0.1, 0.12)) =>
    page.drawText(seguro(s), { x, y: yy, size, font, color });
  const nuevaPagina = (alto: number) => {
    if (y - alto < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };

  try {
    const logo = await doc.embedPng(await readFile(path.join(process.cwd(), "public", "petrominal-logo.png")));
    page.drawImage(logo, { x: M, y: y - 50, width: (logo.width / logo.height) * 50, height: 50 });
  } catch {
    /* sin logo */
  }
  t("INFORME GERENCIAL", W - M - fb.widthOfTextAtSize("INFORME GERENCIAL", 16), y - 16, 16, fb, AZUL);
  const rango = `${fecha(inf.desde)} — ${fecha(new Date(new Date(inf.hasta).getTime() - 1).toISOString())}`;
  t(rango, W - M - f.widthOfTextAtSize(seguro(rango), 9), y - 32, 9, f, GRIS);
  y -= 70;

  // KPIs en tarjetas
  const k = inf.kpis;
  const tarjetas: [string, string][] = [
    ["Clientes nuevos", String(k.clientesNuevos)],
    ["Conversaciones nuevas", String(k.conversacionesNuevas)],
    ["Cotizaciones", `${k.cotizaciones} (${k.cotizacionesEnviadas} enviadas)`],
    ["Monto cotizado enviado", formatoPesos(k.montoEnviado)],
    ["Reuniones", `${k.reunionesProgramadas} (${k.reunionesRealizadas} realizadas)`],
    ["Clientes sin asesor", String(k.sinAsesor)],
  ];
  const ancho = (W - 2 * M - 20) / 3;
  tarjetas.forEach(([etq, val], i) => {
    const x = M + (i % 3) * (ancho + 10);
    const yy = y - Math.floor(i / 3) * 52;
    page.drawRectangle({ x, y: yy - 42, width: ancho, height: 46, color: SUAVE });
    t(etq, x + 8, yy - 12, 8, f, GRIS);
    t(val, x + 8, yy - 32, 12, fb);
  });
  y -= 116;

  // Gráfico: leads por etapa
  const barras = (titulo: string, datos: { etiqueta: string; valor: number; texto?: string }[]) => {
    nuevaPagina(30 + datos.length * 20);
    t(titulo, M, y, 11, fb, AZUL);
    y -= 18;
    const max = Math.max(1, ...datos.map((d) => d.valor));
    const anchoEtq = 150;
    const anchoMax = W - 2 * M - anchoEtq - 90;
    for (const d of datos) {
      t(d.etiqueta.slice(0, 32), M, y, 9);
      const w = (d.valor / max) * anchoMax;
      page.drawRectangle({ x: M + anchoEtq, y: y - 3, width: Math.max(w, 1), height: 12, color: AZUL });
      t(d.texto ?? String(d.valor), M + anchoEtq + w + 6, y, 9, fb);
      y -= 20;
    }
    y -= 10;
  };
  barras(
    "Estado de los leads (pipeline actual)",
    inf.porEtapa.map((e) => ({ etiqueta: e.etapa, valor: e.leads }))
  );
  barras(
    "Monto cotizado enviado por asesor",
    inf.porAsesor.map((a) => ({ etiqueta: a.nombre, valor: a.montoEnviado, texto: formatoPesos(a.montoEnviado) }))
  );

  // Tabla por asesor
  nuevaPagina(40 + inf.porAsesor.length * 16);
  t("Desempeño por asesor", M, y, 11, fb, AZUL);
  y -= 18;
  const cols = [M, M + 160, M + 230, M + 300, M + 360, M + 450];
  const enc = ["Asesor", "Clientes", "Cotiz.", "Enviadas", "Monto enviado", "Reuniones"];
  page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: AZUL });
  enc.forEach((e, i) => t(e, cols[i]! + 4, y, 8, fb, rgb(1, 1, 1)));
  y -= 18;
  for (const a of inf.porAsesor) {
    const fila = [a.nombre, String(a.clientes), String(a.cotizaciones), String(a.enviadas), formatoPesos(a.montoEnviado), `${a.reuniones} (${a.realizadas} real.)`];
    fila.forEach((v, i) => t(v.slice(0, 30), cols[i]! + 4, y, 8.5));
    y -= 16;
  }
  y -= 12;

  // Próximas reuniones
  if (inf.proximasReuniones.length) {
    nuevaPagina(40);
    t("Reuniones programadas", M, y, 11, fb, AZUL);
    y -= 16;
    for (const r of inf.proximasReuniones.slice(0, 25)) {
      nuevaPagina(14);
      const cuando = new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
      }).format(new Date(r.inicio));
      t(`${cuando} · ${r.titulo} · ${r.cliente}${r.asesor ? ` · ${r.asesor}` : ""}`.slice(0, 110), M, y, 8.5);
      y -= 13;
    }
  }

  return Buffer.from(await doc.save());
}
