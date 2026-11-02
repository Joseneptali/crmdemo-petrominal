"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageOff, ImagePlus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaginaCatalogo, Producto, ResumenCatalogo } from "@/lib/catalogo";

type Respuesta = PaginaCatalogo & { resumen?: ResumenCatalogo };

const VACIO_NUEVO = { referencia: "", descripcion: "", linea: "", grupo: "", marca: "", unidad: "UND" };

async function mensajeDeError(res: Response | null, porDefecto: string): Promise<string> {
  const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return d?.error?.message ?? porDefecto;
}

/**
 * Petrominal — catálogo de productos del cotizador. Todo el equipo busca, crea
 * productos y les pone foto (sin foto no se puede cotizar).
 */
export function CatalogoClient({ puedeImportar }: { puedeImportar: boolean }) {
  const [q, setQ] = useState("");
  const [linea, setLinea] = useState("");
  const [foto, setFoto] = useState<"todas" | "con" | "sin">("todas");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [resumen, setResumen] = useState<ResumenCatalogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [nuevo, setNuevo] = useState<typeof VACIO_NUEVO | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const destinoFoto = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    const p = new URLSearchParams({ pagina: String(pagina), porPagina: String(porPagina), foto, resumen: "1" });
    if (q.trim()) p.set("q", q.trim());
    if (linea) p.set("linea", linea);
    const res = await fetch(`/api/catalogo?${p.toString()}`).catch(() => null);
    if (!res?.ok) {
      setError(await mensajeDeError(res, "No se pudo cargar el catálogo."));
      return;
    }
    const d = (await res.json()) as Respuesta;
    setDatos(d);
    if (d.resumen) setResumen(d.resumen);
    setError(null);
  }, [pagina, porPagina, foto, q, linea]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 250);
    return () => clearTimeout(t);
  }, [cargar]);

  async function importar() {
    setImportando(true);
    const res = await fetch("/api/catalogo/importar", { method: "POST" }).catch(() => null);
    setImportando(false);
    if (!res?.ok) {
      setError(await mensajeDeError(res, "No se pudo cargar el catálogo."));
      return;
    }
    void cargar();
  }

  async function crear() {
    if (!nuevo) return;
    setGuardando(true);
    const res = await fetch("/api/catalogo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nuevo),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      setError(await mensajeDeError(res, "No se pudo crear el producto."));
      return;
    }
    const { producto } = (await res.json()) as { producto: Producto };
    setNuevo(null);
    setQ(producto.referencia);
    setPagina(1);
  }

  function elegirFoto(id: string) {
    destinoFoto.current = id;
    archivo.current?.click();
  }

  async function subirFoto(f: File | undefined) {
    const id = destinoFoto.current;
    if (!f || !id) return;
    setSubiendo(id);
    const form = new FormData();
    form.set("foto", f);
    const res = await fetch(`/api/catalogo/${id}/foto`, { method: "POST", body: form }).catch(() => null);
    setSubiendo(null);
    if (archivo.current) archivo.current.value = "";
    if (!res?.ok) {
      setError(await mensajeDeError(res, "No se pudo subir la foto."));
      return;
    }
    void cargar();
  }

  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;

  return (
    <div className="max-w-6xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de productos</CardTitle>
          <CardDescription>
            Los productos que se cotizan. El precio se digita en cada cotización; la foto es
            obligatoria para enviarla, así que agrega las que falten.
            {resumen && (
              <>
                {" "}
                <strong>{resumen.total.toLocaleString("es-CO")}</strong> productos ·{" "}
                <strong>{resumen.conFoto.toLocaleString("es-CO")}</strong> con foto.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {resumen?.total === 0 && puedeImportar && (
            <div className="rounded-md border bg-subtle p-3 text-sm">
              <p className="mb-2">El catálogo está vacío. Carga el inventario de Siigo de Petrominal (2.934 referencias).</p>
              <Button size="sm" onClick={() => void importar()} disabled={importando}>
                {importando ? "Cargando…" : "Cargar catálogo Petrominal"}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-3" />
              <Input
                className="pl-8"
                placeholder="Buscar por referencia, descripción, grupo o marca"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPagina(1);
                }}
                aria-label="Buscar productos"
              />
            </div>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={linea}
              onChange={(e) => {
                setLinea(e.target.value);
                setPagina(1);
              }}
              aria-label="Línea"
            >
              <option value="">Todas las líneas</option>
              {resumen?.lineas.map((l) => (
                <option key={l.linea} value={l.linea}>
                  {l.linea || "(sin línea)"} ({l.total})
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={foto}
              onChange={(e) => {
                setFoto(e.target.value as typeof foto);
                setPagina(1);
              }}
              aria-label="Foto"
            >
              <option value="todas">Con y sin foto</option>
              <option value="con">Con foto</option>
              <option value="sin">Sin foto</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => setNuevo({ ...VACIO_NUEVO })}>
              <Plus className="h-4 w-4" /> Nuevo producto
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {nuevo && (
            <div className="grid gap-3 rounded-md border bg-subtle p-3 sm:grid-cols-3">
              {(
                [
                  ["referencia", "Referencia *"],
                  ["descripcion", "Descripción *"],
                  ["linea", "Línea"],
                  ["grupo", "Grupo"],
                  ["marca", "Marca"],
                  ["unidad", "Unidad"],
                ] as const
              ).map(([campo, etiqueta]) => (
                <div key={campo} className="space-y-1.5">
                  <Label htmlFor={`nuevo-${campo}`}>{etiqueta}</Label>
                  <Input
                    id={`nuevo-${campo}`}
                    value={nuevo[campo]}
                    onChange={(e) => setNuevo({ ...nuevo, [campo]: e.target.value })}
                  />
                </div>
              ))}
              <div className="flex gap-2 sm:col-span-3">
                <Button
                  size="sm"
                  onClick={() => void crear()}
                  disabled={guardando || !nuevo.referencia.trim() || !nuevo.descripcion.trim()}
                >
                  {guardando ? "Guardando…" : "Guardar producto"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNuevo(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <input
            ref={archivo}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => void subirFoto(e.target.files?.[0])}
          />

          {datos === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : datos.productos.length === 0 ? (
            <p className="text-sm text-text-2">No hay productos con esos filtros.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {datos.productos.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-text-3">
                    {(datos.pagina - 1) * datos.porPagina + i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => elegirFoto(p.id)}
                    className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border bg-background"
                    aria-label={p.fotoUrl ? `Cambiar foto de ${p.referencia}` : `Agregar foto a ${p.referencia}`}
                    title={p.fotoUrl ? "Cambiar foto" : "Agregar foto"}
                  >
                    {subiendo === p.id ? (
                      <span className="text-[10px] text-text-3">Subiendo…</span>
                    ) : p.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.fotoUrl} alt={p.descripcion} className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="h-5 w-5 text-text-3" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.descripcion}</p>
                    <p className="truncate text-xs text-text-2">
                      <span className="font-mono">{p.referencia}</span> · {p.linea} · {p.grupo}
                      {p.marca ? ` · ${p.marca}` : ""} · {p.unidad}
                    </p>
                  </div>
                  {!p.fotoUrl && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-amber-600">
                      <ImageOff className="h-3.5 w-3.5" /> Sin foto
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {datos && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-2">
              <span className="flex items-center gap-2">
                Mostrando {datos.total === 0 ? 0 : (datos.pagina - 1) * datos.porPagina + 1}–
                {Math.min(datos.pagina * datos.porPagina, datos.total)} de {datos.total.toLocaleString("es-CO")}
                <select
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={porPagina}
                  onChange={(e) => {
                    setPorPagina(Number(e.target.value));
                    setPagina(1);
                  }}
                  aria-label="Filas por página"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} por página
                    </option>
                  ))}
                </select>
                · página {pagina} de {totalPaginas}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina(pagina + 1)}
                >
                  Siguiente
                </Button>
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
