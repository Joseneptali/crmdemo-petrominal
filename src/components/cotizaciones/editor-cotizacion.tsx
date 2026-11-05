"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, ImagePlus, Mail, MessageCircle, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Producto } from "@/lib/catalogo";
import {
  formatoPesos,
  numeroCotizacion,
  type CotizacionDto,
  type ItemCotizacionDto,
} from "@/lib/cotizaciones";

type Renglon = Omit<ItemCotizacionDto, "id"> & { clave: string };

let contador = 0;
const nuevaClave = () => `r${++contador}`;

async function leerError(res: Response | null, porDefecto: string): Promise<string> {
  const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return d?.error?.message ?? porDefecto;
}

/**
 * Petrominal — editor de una cotización. Exige foto en cada producto antes de
 * enviar: la foto se agrega aquí mismo (queda en el catálogo).
 */
export function EditorCotizacion({ id }: { id: string }) {
  const [cot, setCot] = useState<CotizacionDto | null>(null);
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [iva, setIva] = useState(19);
  const [validez, setValidez] = useState(15);
  const [solicitud, setSolicitud] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [lugarEntrega, setLugarEntrega] = useState("");
  const [descuento, setDescuento] = useState(0);
  const [zonaFranca, setZonaFranca] = useState(false);
  const [condiciones, setCondiciones] = useState("");
  const [notas, setNotas] = useState("");
  const [sucio, setSucio] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [para, setPara] = useState("");
  const [nuevo, setNuevo] = useState<{ referencia: string; descripcion: string; unidad: string } | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const fotoPara = useRef<string | null>(null);

  const aplicar = useCallback((c: CotizacionDto) => {
    setCot(c);
    setRenglones(c.items.map((i) => ({ ...i, clave: nuevaClave() })));
    setIva(c.ivaPorcentaje);
    setValidez(c.validezDias);
    setSolicitud(c.solicitud ?? "");
    setFormaPago(c.formaPago ?? "");
    setLugarEntrega(c.lugarEntrega ?? "");
    setDescuento(c.descuentoPorcentaje);
    setZonaFranca(c.zonaFranca);
    setCondiciones(c.condiciones ?? "");
    setNotas(c.notas ?? "");
    setPara((p) => p || c.contacto.correo || "");
    setSucio(false);
  }, []);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/cotizaciones/${id}`).catch(() => null);
    if (!res?.ok) {
      setAviso({ tipo: "error", texto: await leerError(res, "No se pudo abrir la cotización") });
      return;
    }
    aplicar(((await res.json()) as { cotizacion: CotizacionDto }).cotizacion);
  }, [id, aplicar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!q.trim()) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/catalogo?q=${encodeURIComponent(q)}&porPagina=10`).catch(() => null);
      if (res?.ok) setResultados(((await res.json()) as { productos: Producto[] }).productos);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const cambiar = (clave: string, patch: Partial<Renglon>) => {
    setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, ...patch } : r)));
    setSucio(true);
  };

  function agregar(p: Producto) {
    setRenglones((rs) => [
      ...rs,
      {
        clave: nuevaClave(),
        productoId: p.id,
        referencia: p.referencia,
        descripcion: p.descripcion,
        unidad: p.unidad,
        cantidad: 1,
        precioUnitario: 0,
        diasEntrega: null,
        fotoUrl: p.fotoUrl,
      },
    ]);
    setQ("");
    setSucio(true);
  }

  async function crearProducto() {
    if (!nuevo) return;
    const res = await fetch("/api/catalogo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nuevo),
    }).catch(() => null);
    if (!res?.ok) {
      setAviso({ tipo: "error", texto: await leerError(res, "No se pudo crear el producto") });
      return;
    }
    agregar(((await res.json()) as { producto: Producto }).producto);
    setNuevo(null);
    setAviso({ tipo: "ok", texto: "Producto creado en el catálogo. Agrégale la foto antes de enviar." });
  }

  async function guardar(): Promise<boolean> {
    setOcupado("guardar");
    setAviso(null);
    const res = await fetch(`/api/cotizaciones/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ivaPorcentaje: iva,
        validezDias: validez,
        solicitud: solicitud.trim() || null,
        formaPago: formaPago.trim() || null,
        lugarEntrega: lugarEntrega.trim() || null,
        descuentoPorcentaje: descuento >= 0 && descuento <= 100 ? Math.round(descuento) : 0,
        zonaFranca,
        condiciones: condiciones || null,
        notas: notas || null,
        items: renglones.map((r) => ({
          productoId: r.productoId,
          referencia: r.referencia,
          descripcion: r.descripcion,
          unidad: r.unidad,
          cantidad: r.cantidad > 0 ? r.cantidad : 1,
          precioUnitario: r.precioUnitario >= 0 ? r.precioUnitario : 0,
          diasEntrega: r.diasEntrega?.trim() || null,
        })),
      }),
    }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) {
      setAviso({ tipo: "error", texto: await leerError(res, "No se pudo guardar") });
      return false;
    }
    aplicar(((await res.json()) as { cotizacion: CotizacionDto }).cotizacion);
    return true;
  }

  function elegirFoto(productoId: string | null) {
    if (!productoId) return;
    fotoPara.current = productoId;
    archivo.current?.click();
  }

  async function subirFoto(f: File | undefined) {
    const pid = fotoPara.current;
    if (!f || !pid) return;
    setOcupado("foto");
    const form = new FormData();
    form.set("foto", f);
    const res = await fetch(`/api/catalogo/${pid}/foto`, { method: "POST", body: form }).catch(() => null);
    setOcupado(null);
    if (archivo.current) archivo.current.value = "";
    if (!res?.ok) {
      setAviso({ tipo: "error", texto: await leerError(res, "No se pudo subir la foto") });
      return;
    }
    const { producto } = (await res.json()) as { producto: Producto };
    setRenglones((rs) => rs.map((r) => (r.productoId === pid ? { ...r, fotoUrl: producto.fotoUrl } : r)));
  }

  async function enviar(canal: "whatsapp" | "correo") {
    if (sucio && !(await guardar())) return;
    setOcupado(canal);
    setAviso(null);
    const res = await fetch(`/api/cotizaciones/${id}/enviar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(canal === "correo" ? { canal, para: para.trim() } : { canal }),
    }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) {
      setAviso({ tipo: "error", texto: await leerError(res, "No se pudo enviar") });
      return;
    }
    aplicar(((await res.json()) as { cotizacion: CotizacionDto }).cotizacion);
    setAviso({
      tipo: "ok",
      texto: canal === "whatsapp" ? "Cotización enviada por WhatsApp." : `Cotización enviada a ${para.trim()}.`,
    });
  }

  if (!cot) {
    return <p className="text-sm text-muted-foreground">{aviso?.texto ?? "Cargando…"}</p>;
  }

  const subtotal = renglones.reduce((s, r) => s + r.cantidad * r.precioUnitario, 0);
  const valorDcto = Math.round(subtotal * descuento) / 100;
  const base = subtotal - valorDcto;
  const valorIva = zonaFranca ? 0 : Math.round(base * iva) / 100;
  const sinFoto = renglones.filter((r) => !r.fotoUrl).map((r) => r.referencia);
  const sinPrecio = renglones.filter((r) => !(r.precioUnitario > 0)).length;
  const bloqueo =
    renglones.length === 0
      ? "Agrega al menos un producto."
      : sinPrecio
        ? "Digita el precio de todos los productos."
        : sinFoto.length
          ? `Faltan fotos de referencia: ${sinFoto.join(", ")}.`
          : null;

  return (
    <div className="max-w-6xl space-y-4">
      <Link href="/cotizaciones" className="inline-flex items-center gap-1 text-sm text-text-2 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Cotizaciones
      </Link>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>
              {numeroCotizacion(cot.numero)} · {cot.contacto.nombre}
            </CardTitle>
            <p className="mt-1 text-sm text-text-2">
              {cot.contacto.empresa ? `${cot.contacto.empresa} · ` : ""}
              {cot.contacto.telefono ? `+${cot.contacto.telefono} · ` : ""}
              Asesor: {cot.asesor?.nombre ?? "—"} ·{" "}
              <span className={cot.estado === "enviada" ? "text-emerald-600" : "text-amber-600"}>
                {cot.estado === "enviada" ? "Enviada" : "Borrador"}
              </span>
            </p>
          </div>
          <a
            href={cot.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"
          >
            <FileDown className="h-4 w-4" /> Ver PDF
          </a>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={archivo}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => void subirFoto(e.target.files?.[0])}
          />

          <div className="space-y-1.5">
            <Label htmlFor="solicitud">Solicitud del cliente</Label>
            <Input
              id="solicitud"
              placeholder="Ej.: ESLINGA CON RECUBRIMIENTO EN CORDURA"
              value={solicitud}
              onChange={(e) => {
                setSolicitud(e.target.value);
                setSucio(true);
              }}
            />
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-subtle text-left text-xs text-text-2">
                <tr>
                  <th className="p-2">Foto</th>
                  <th className="p-2">Referencia</th>
                  <th className="p-2">Descripción</th>
                  <th className="p-2">Unidad</th>
                  <th className="p-2 text-right">Cantidad</th>
                  <th className="p-2">Días entrega</th>
                  <th className="p-2 text-right">Vr. unitario</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {renglones.map((r) => (
                  <tr key={r.clave}>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => elegirFoto(r.productoId)}
                        className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded border ${r.fotoUrl ? "" : "border-destructive"}`}
                        title={r.fotoUrl ? "Cambiar foto" : "Agregar foto (obligatoria)"}
                      >
                        {r.fotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.fotoUrl} alt={r.referencia} className="h-full w-full object-cover" />
                        ) : (
                          <ImagePlus className="h-5 w-5 text-destructive" />
                        )}
                      </button>
                    </td>
                    <td className="p-2 font-mono text-xs">{r.referencia}</td>
                    <td className="p-2">
                      <Input value={r.descripcion} onChange={(e) => cambiar(r.clave, { descripcion: e.target.value })} />
                    </td>
                    <td className="w-20 p-2">
                      <Input value={r.unidad} onChange={(e) => cambiar(r.clave, { unidad: e.target.value })} />
                    </td>
                    <td className="w-24 p-2">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="text-right"
                        value={r.cantidad}
                        onChange={(e) => cambiar(r.clave, { cantidad: Number(e.target.value) })}
                      />
                    </td>
                    <td className="w-28 p-2">
                      <Input
                        value={r.diasEntrega ?? ""}
                        placeholder="Inmediata"
                        onChange={(e) => cambiar(r.clave, { diasEntrega: e.target.value })}
                      />
                    </td>
                    <td className="w-36 p-2">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className={`text-right ${r.precioUnitario > 0 ? "" : "border-amber-500"}`}
                        value={r.precioUnitario || ""}
                        placeholder="Precio"
                        onChange={(e) => cambiar(r.clave, { precioUnitario: Number(e.target.value) })}
                      />
                    </td>
                    <td className="w-32 p-2 text-right font-medium">{formatoPesos(r.cantidad * r.precioUnitario, cot.moneda)}</td>
                    <td className="p-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Quitar ${r.referencia}`}
                        onClick={() => {
                          setRenglones((rs) => rs.filter((x) => x.clave !== r.clave));
                          setSucio(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {renglones.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-4 text-center text-sm text-text-3">
                      Busca productos del catálogo para agregarlos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-3" />
                <Input
                  className="pl-8"
                  placeholder="Agregar producto: referencia o descripción"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              {resultados.length > 0 && (
                <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                  {resultados.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => agregar(p)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border">
                          {p.fotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.fotoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImagePlus className="h-4 w-4 text-text-3" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{p.descripcion}</span>
                          <span className="block truncate text-xs text-text-3">
                            {p.referencia} · {p.linea}
                          </span>
                        </span>
                        <Plus className="h-4 w-4 text-text-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!nuevo ? (
                <Button size="sm" variant="ghost" onClick={() => setNuevo({ referencia: "", descripcion: "", unidad: "UND" })}>
                  <Plus className="h-4 w-4" /> Producto que no está en el catálogo
                </Button>
              ) : (
                <div className="grid gap-2 rounded-md border bg-subtle p-2 sm:grid-cols-3">
                  <Input placeholder="Referencia" value={nuevo.referencia} onChange={(e) => setNuevo({ ...nuevo, referencia: e.target.value })} />
                  <Input className="sm:col-span-2" placeholder="Descripción" value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} />
                  <div className="flex gap-2 sm:col-span-3">
                    <Button size="sm" disabled={!nuevo.referencia.trim() || !nuevo.descripcion.trim()} onClick={() => void crearProducto()}>
                      Crear y agregar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setNuevo(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1 rounded-md border p-3 text-sm">
              <label className="flex items-center gap-2 pb-1 font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={zonaFranca}
                  onChange={(e) => { setZonaFranca(e.target.checked); setSucio(true); }}
                />
                Zona franca (IVA exento)
              </label>
              <div className="flex justify-between"><span>Subtotal</span><span>{formatoPesos(subtotal, cot.moneda)}</span></div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1">
                  Dcto.
                  <Input type="number" min={0} max={100} className="h-7 w-16 text-right" value={descuento} onChange={(e) => { setDescuento(Number(e.target.value)); setSucio(true); }} />%
                </span>
                <span>{formatoPesos(valorDcto, cot.moneda)}</span>
              </div>
              <div className="flex justify-between"><span>Base</span><span>{formatoPesos(base, cot.moneda)}</span></div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1">
                  IVA
                  <Input type="number" min={0} max={100} disabled={zonaFranca} className="h-7 w-16 text-right" value={iva} onChange={(e) => { setIva(Number(e.target.value)); setSucio(true); }} />%
                  {zonaFranca && <span className="text-xs text-text-3">exento</span>}
                </span>
                <span>{formatoPesos(valorIva, cot.moneda)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total</span><span>{formatoPesos(base + valorIva, cot.moneda)}</span></div>
              <div className="flex items-center gap-2 pt-2">
                <Label htmlFor="validez">Validez (días)</Label>
                <Input id="validez" type="number" min={1} className="h-8 w-20" value={validez} onChange={(e) => { setValidez(Number(e.target.value)); setSucio(true); }} />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="formaPago">Forma / cond. de pago</Label>
              <Input id="formaPago" placeholder="Ej.: CREDITO 30 DIAS F/F" value={formaPago} onChange={(e) => { setFormaPago(e.target.value); setSucio(true); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lugarEntrega">Lugar de entrega</Label>
              <Input id="lugarEntrega" placeholder="Dirección de entrega" value={lugarEntrega} onChange={(e) => { setLugarEntrega(e.target.value); setSucio(true); }} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="condiciones">Nota (aviso del pie del PDF)</Label>
              <Textarea id="condiciones" rows={3} value={condiciones} onChange={(e) => { setCondiciones(e.target.value); setSucio(true); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notas">Observaciones</Label>
              <Textarea id="notas" rows={3} value={notas} onChange={(e) => { setNotas(e.target.value); setSucio(true); }} />
            </div>
          </div>

          {aviso && <p className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p>}
          {bloqueo && <p className="text-sm text-amber-600">Para enviar: {bloqueo}</p>}

          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => void guardar()} disabled={ocupado !== null || !sucio}>
              {ocupado === "guardar" ? "Guardando…" : sucio ? "Guardar cambios" : "Guardado"}
            </Button>
            <Button onClick={() => void enviar("whatsapp")} disabled={ocupado !== null || !!bloqueo}>
              <MessageCircle className="h-4 w-4" /> {ocupado === "whatsapp" ? "Enviando…" : "Enviar por WhatsApp"}
            </Button>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="para" className="text-xs">Correo del cliente</Label>
                <Input id="para" className="h-9 w-64" value={para} onChange={(e) => setPara(e.target.value)} placeholder="cliente@empresa.com" />
              </div>
              <Button onClick={() => void enviar("correo")} disabled={ocupado !== null || !!bloqueo || !para.includes("@")}>
                <Mail className="h-4 w-4" /> {ocupado === "correo" ? "Enviando…" : "Enviar por correo"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
