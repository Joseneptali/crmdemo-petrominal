"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatoPesos } from "@/lib/cotizaciones";
import { fechaReunion } from "@/lib/reuniones";
import type { Informe } from "@/lib/informes";

/*
 * Petrominal — informes para la administración. Gráficos en SVG propio (sin
 * librería), un eje por gráfico, colores por tokens (claro/oscuro validados),
 * tooltip al pasar el mouse y descarga en PNG. Exportes a Excel (CSV) y PDF.
 */

const ESTILO = `
.inf-graf { --s1:#2a78d6; --s2:#eb6834; --tx:#52514e; --gr:#e6e5e1; }
@media (prefers-color-scheme: dark) { .inf-graf { --s1:#3987e5; --s2:#d95926; --tx:#c3c2b7; --gr:#33332f; } }
:root[data-theme="dark"] .inf-graf { --s1:#3987e5; --s2:#d95926; --tx:#c3c2b7; --gr:#33332f; }
:root[data-theme="light"] .inf-graf { --s1:#2a78d6; --s2:#eb6834; --tx:#52514e; --gr:#e6e5e1; }
`;

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const haceDias = (n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(Date.now() - n * 86_400_000));

/** Descarga un <svg> como PNG, resolviendo los colores de los tokens. */
async function descargarPng(svg: SVGSVGElement | null, nombre: string) {
  if (!svg) return;
  const copia = svg.cloneNode(true) as SVGSVGElement;
  const estilos = getComputedStyle(svg);
  const tokens = ["--s1", "--s2", "--tx", "--gr"].map((t) => [t, estilos.getPropertyValue(t).trim()] as const);
  let xml = new XMLSerializer().serializeToString(copia);
  for (const [t, v] of tokens) xml = xml.replaceAll(`var(${t})`, v || "#888");
  const { width, height } = svg.viewBox.baseVal;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(2, 2);
  ctx.drawImage(img, 0, 0, width, height);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${nombre}.png`;
  a.click();
}

function Barras({
  titulo,
  datos,
  formato = (v: number) => String(v),
  nombre,
}: {
  titulo: string;
  datos: { etiqueta: string; valor: number }[];
  formato?: (v: number) => string;
  nombre: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const fila = 30;
  const H = Math.max(60, datos.length * fila + 16);
  const etq = 170;
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const ancho = W - etq - 110;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <Button size="sm" variant="ghost" onClick={() => void descargarPng(ref.current, nombre)}>
          <Download className="h-4 w-4" /> PNG
        </Button>
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="inf-graf w-full" role="img" aria-label={titulo}>
        <line x1={etq} x2={etq} y1={4} y2={H - 8} stroke="var(--gr)" strokeWidth={1} />
        {datos.map((d, i) => {
          const y = 8 + i * fila;
          const w = Math.max((d.valor / max) * ancho, d.valor > 0 ? 2 : 0);
          return (
            <g key={d.etiqueta} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={y - 4} width={W} height={fila} fill="transparent" />
              <text x={etq - 8} y={y + 13} textAnchor="end" fontSize={12} fill="var(--tx)">
                {d.etiqueta.length > 24 ? `${d.etiqueta.slice(0, 23)}…` : d.etiqueta}
              </text>
              <rect x={etq} y={y + 2} width={w} height={16} rx={4} fill="var(--s1)" opacity={hover === null || hover === i ? 1 : 0.55} />
              <text x={etq + w + 6} y={y + 14} fontSize={12} fontWeight={600} fill="var(--tx)">
                {formato(d.valor)}
              </text>
              <title>{`${d.etiqueta}: ${formato(d.valor)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Lineas({ informe }: { informe: Informe }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const datos = informe.porDia;
  const W = 640;
  const H = 220;
  const m = { l: 32, r: 12, t: 12, b: 28 };
  const max = Math.max(1, ...datos.map((d) => Math.max(d.cotizaciones, d.clientesNuevos)));
  const x = (i: number) => m.l + (datos.length <= 1 ? 0 : (i / (datos.length - 1)) * (W - m.l - m.r));
  const y = (v: number) => H - m.b - (v / max) * (H - m.t - m.b);
  const ruta = (k: "cotizaciones" | "clientesNuevos") =>
    datos.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const marcas = [0, Math.ceil(max / 2), max];
  const d = hover !== null ? datos[hover] : null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Actividad diaria</h3>
        <Button size="sm" variant="ghost" onClick={() => void descargarPng(ref.current, "actividad-diaria")}>
          <Download className="h-4 w-4" /> PNG
        </Button>
      </div>
      <div className="flex gap-4 text-xs text-text-2">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: "#2a78d6" }} /> Clientes nuevos</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: "#eb6834" }} /> Cotizaciones</span>
        {d && (
          <span className="ml-auto font-medium text-foreground">
            {d.dia}: {d.clientesNuevos} clientes · {d.cotizaciones} cotizaciones
          </span>
        )}
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="inf-graf w-full"
        role="img"
        aria-label="Clientes nuevos y cotizaciones por día"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - m.l) / (W - m.l - m.r)) * (datos.length - 1));
          setHover(Math.min(Math.max(i, 0), datos.length - 1));
        }}
      >
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--gr)" strokeWidth={1} />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--tx)">{v}</text>
          </g>
        ))}
        {datos.length > 0 && (
          <>
            <text x={m.l} y={H - 8} fontSize={10} fill="var(--tx)">{datos[0]!.dia}</text>
            <text x={W - m.r} y={H - 8} textAnchor="end" fontSize={10} fill="var(--tx)">{datos.at(-1)!.dia}</text>
          </>
        )}
        <path d={ruta("clientesNuevos")} fill="none" stroke="var(--s1)" strokeWidth={2} />
        <path d={ruta("cotizaciones")} fill="none" stroke="var(--s2)" strokeWidth={2} />
        {hover !== null && d && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={H - m.b} stroke="var(--tx)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(d.clientesNuevos)} r={4} fill="var(--s1)" />
            <circle cx={x(hover)} cy={y(d.cotizaciones)} r={4} fill="var(--s2)" />
          </g>
        )}
      </svg>
    </div>
  );
}

export function InformesClient({ administracion }: { administracion: boolean }) {
  const [desde, setDesde] = useState(haceDias(29));
  const [hasta, setHasta] = useState(hoy());
  const [inf, setInf] = useState<Informe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = `desde=${desde}&hasta=${hasta}`;
  const cargar = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/informes?${qs}`).catch(() => null);
    if (!res?.ok) {
      setError("No se pudo cargar el informe.");
      return;
    }
    setInf(((await res.json()) as { informe: Informe }).informe);
  }, [qs]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const k = inf?.kpis;
  return (
    <div className="max-w-6xl space-y-6">
      <style>{ESTILO}</style>
      <Card>
        <CardHeader>
          <CardTitle>{administracion ? "Informes gerenciales" : "Mis ventas"}</CardTitle>
          <CardDescription>
            {administracion
              ? "Estado de los leads, desempeño de los asesores, cotizaciones y reuniones del periodo."
              : "Tus clientes, cotizaciones y reuniones del periodo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="inf-desde">Desde</Label>
              <Input id="inf-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inf-hasta">Hasta</Label>
              <Input id="inf-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <a href={`/api/informes/pdf?${qs}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
                <FileDown className="h-4 w-4" /> {administracion ? "Informe PDF" : "Mi informe PDF"}
              </a>
              {(["leads", "cotizaciones", "reuniones"] as const).map((t) => (
                <a key={t} href={`/api/informes/csv?tipo=${t}&${qs}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
                  <FileSpreadsheet className="h-4 w-4" /> {t[0]!.toUpperCase() + t.slice(1)} (Excel)
                </a>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {k && inf && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ["Clientes nuevos", String(k.clientesNuevos)],
                  ["Conversaciones nuevas", String(k.conversacionesNuevas)],
                  ["Cotizaciones enviadas", `${k.cotizacionesEnviadas} de ${k.cotizaciones}`],
                  ["Monto cotizado", formatoPesos(k.montoEnviado)],
                  ["Reuniones", String(k.reunionesProgramadas)],
                  ["Reuniones realizadas", String(k.reunionesRealizadas)],
                  ...(administracion ? [["Clientes sin asesor", String(k.sinAsesor)]] : []),
                ].map(([etq, val]) => (
                  <div key={etq} className="rounded-md border p-3">
                    <p className="text-xs text-text-2">{etq}</p>
                    <p className="mt-1 text-xl font-semibold">{val}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Barras titulo="Estado de los leads (pipeline actual)" nombre="leads-por-etapa" datos={inf.porEtapa.map((e) => ({ etiqueta: e.etapa, valor: e.leads }))} />
                {administracion && <Barras
                  titulo="Monto cotizado enviado por asesor"
                  nombre="monto-por-asesor"
                  formato={(v) => formatoPesos(v)}
                  datos={inf.porAsesor.map((a) => ({ etiqueta: a.nombre, valor: a.montoEnviado }))}
                />}
              </div>
              <Lineas informe={inf} />

              <div className="overflow-x-auto">
                <h3 className="mb-2 text-sm font-semibold">{administracion ? "Desempeño por asesor" : "Mi desempeño"}</h3>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-subtle text-left text-xs text-text-2">
                    <tr>
                      <th className="p-2">Asesor</th>
                      <th className="p-2 text-right">Clientes</th>
                      <th className="p-2 text-right">Cotizaciones</th>
                      <th className="p-2 text-right">Enviadas</th>
                      <th className="p-2 text-right">Monto enviado</th>
                      <th className="p-2 text-right">Reuniones</th>
                      <th className="p-2 text-right">Realizadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {inf.porAsesor.map((a) => (
                      <tr key={a.nombre}>
                        <td className="p-2">{a.nombre}</td>
                        <td className="p-2 text-right">{a.clientes}</td>
                        <td className="p-2 text-right">{a.cotizaciones}</td>
                        <td className="p-2 text-right">{a.enviadas}</td>
                        <td className="p-2 text-right">{formatoPesos(a.montoEnviado)}</td>
                        <td className="p-2 text-right">{a.reuniones}</td>
                        <td className="p-2 text-right">{a.realizadas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Reuniones programadas</h3>
                {inf.proximasReuniones.length === 0 ? (
                  <p className="text-sm text-text-2">No hay reuniones próximas.</p>
                ) : (
                  <ul className="divide-y rounded-md border text-sm">
                    {inf.proximasReuniones.map((r) => (
                      <li key={`${r.inicio}-${r.titulo}`} className="px-3 py-2">
                        {fechaReunion(r.inicio)} · {r.titulo} · {r.cliente}
                        {r.asesor ? ` · ${r.asesor}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
