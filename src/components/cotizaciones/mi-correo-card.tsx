"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Correo = {
  host: string;
  puerto: number;
  seguro: boolean;
  usuario: string;
  nombreRemitente: string | null;
  firma: string | null;
};

/**
 * Petrominal — el correo corporativo desde el que cada asesor envía
 * cotizaciones e invitaciones. Yahoo Small Business con contraseña de
 * aplicación por defecto.
 */
export function MiCorreoCard() {
  const [abierto, setAbierto] = useState(false);
  const [correo, setCorreo] = useState<Correo | null>(null);
  const [form, setForm] = useState({
    host: "smtp.bizmail.yahoo.com",
    puerto: "465",
    usuario: "",
    clave: "",
    nombreRemitente: "",
    firma: "",
  });
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void fetch("/api/mi-correo")
      .then((r) => (r.ok ? (r.json() as Promise<{ correo: Correo | null }>) : null))
      .then((d) => {
        if (!d?.correo) return;
        setCorreo(d.correo);
        setForm((f) => ({
          ...f,
          host: d.correo!.host,
          puerto: String(d.correo!.puerto),
          usuario: d.correo!.usuario,
          nombreRemitente: d.correo!.nombreRemitente ?? "",
          firma: d.correo!.firma ?? "",
        }));
      })
      .catch(() => null);
  }, []);

  async function guardar() {
    setGuardando(true);
    setEstado(null);
    const puerto = Number(form.puerto) || 465;
    const res = await fetch("/api/mi-correo", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: form.host.trim(),
        puerto,
        seguro: puerto === 465,
        usuario: form.usuario.trim(),
        clave: form.clave || undefined,
        nombreRemitente: form.nombreRemitente.trim() || null,
        firma: form.firma.trim() || null,
      }),
    }).catch(() => null);
    setGuardando(false);
    const d = (await res?.json().catch(() => null)) as
      | { correo?: Correo; error?: { message?: string } }
      | null;
    if (!res?.ok || !d?.correo) {
      setEstado({ tipo: "error", texto: d?.error?.message ?? "No se pudo guardar. Revisa la conexión." });
      return;
    }
    setCorreo(d.correo);
    setForm((f) => ({ ...f, clave: "" }));
    setEstado({ tipo: "ok", texto: "Conexión comprobada y guardada." });
  }

  return (
    <div className="rounded-md border p-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-sm font-medium"
        onClick={() => setAbierto(!abierto)}
      >
        <Mail className="h-4 w-4" />
        Mi correo de envío:{" "}
        <span className={correo ? "text-text-2" : "text-amber-600"}>
          {correo ? correo.usuario : "sin configurar (necesario para enviar por correo)"}
        </span>
        <span className="ml-auto text-xs text-text-3">{abierto ? "Cerrar" : "Configurar"}</span>
      </button>
      {abierto && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p className="text-xs text-text-2 sm:col-span-2">
            Yahoo Small Business: servidor <span className="font-mono">smtp.bizmail.yahoo.com</span>, puerto
            465. La contraseña NO es la de tu correo: genera una <strong>contraseña de aplicación</strong> en
            Yahoo → Información de la cuenta → Seguridad de la cuenta → Generar contraseña de aplicación. Se
            guarda cifrada.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="mc-usuario">Tu correo corporativo</Label>
            <Input id="mc-usuario" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} placeholder="nombre@petrominal.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-clave">{correo ? "Nueva contraseña de aplicación (opcional)" : "Contraseña de aplicación"}</Label>
            <Input id="mc-clave" type="password" autoComplete="off" value={form.clave} onChange={(e) => setForm({ ...form, clave: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-host">Servidor SMTP</Label>
            <Input id="mc-host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-puerto">Puerto</Label>
            <Input id="mc-puerto" value={form.puerto} onChange={(e) => setForm({ ...form, puerto: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-nombre">Nombre del remitente</Label>
            <Input id="mc-nombre" value={form.nombreRemitente} onChange={(e) => setForm({ ...form, nombreRemitente: e.target.value })} placeholder="Juan Pérez — Petrominal" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mc-firma">Firma</Label>
            <Textarea id="mc-firma" rows={3} value={form.firma} onChange={(e) => setForm({ ...form, firma: e.target.value })} placeholder={"Juan Pérez\nAsesor comercial · Petrominal S.A.S.\nCel. 300 000 0000"} />
          </div>
          {estado && (
            <p className={`text-sm sm:col-span-2 ${estado.tipo === "ok" ? "text-emerald-600" : "text-destructive"}`}>{estado.texto}</p>
          )}
          <div className="sm:col-span-2">
            <Button size="sm" onClick={() => void guardar()} disabled={guardando || !form.usuario.trim() || (!correo && !form.clave)}>
              {guardando ? "Comprobando…" : "Probar y guardar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
