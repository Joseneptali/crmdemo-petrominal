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

type Proveedor = "yahoo" | "google" | "smtp";

/** Servidores conocidos: elegir el proveedor llena servidor, puerto y seguridad. */
const PROVEEDORES: Record<Exclude<Proveedor, "smtp">, { host: string; puerto: number; etiqueta: string }> = {
  yahoo: { host: "smtp.bizmail.yahoo.com", puerto: 465, etiqueta: "Yahoo! Small Business" },
  google: { host: "smtp.gmail.com", puerto: 465, etiqueta: "Google Workspace (Gmail)" },
};

function proveedorDe(host: string): Proveedor {
  const h = host.trim().toLowerCase();
  if (h === PROVEEDORES.yahoo.host || h.endsWith("mail.yahoo.com")) return "yahoo";
  if (h === PROVEEDORES.google.host || h === "smtp.googlemail.com") return "google";
  return "smtp";
}

/**
 * El correo corporativo desde el que cada asesor envía cotizaciones e
 * invitaciones: Yahoo! Small Business, Google Workspace o cualquier servidor
 * SMTP. Yahoo y Google piden una contraseña de aplicación.
 */
export function MiCorreoCard({
  endpoint = "/api/mi-correo",
  titulo = "Mi correo de envío",
  pista = "sin configurar (necesario para enviar por correo)",
  nota,
}: {
  /** Syrtel — la misma tarjeta sirve para el correo de la IA (`/api/correo-ia`). */
  endpoint?: string;
  titulo?: string;
  pista?: string;
  nota?: string;
} = {}) {
  const [abierto, setAbierto] = useState(false);
  const [correo, setCorreo] = useState<Correo | null>(null);
  const [proveedor, setProveedor] = useState<Proveedor>("yahoo");
  const [seguridad, setSeguridad] = useState<"ssl" | "starttls">("ssl");
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
    void fetch(endpoint)
      .then((r) => (r.ok ? (r.json() as Promise<{ correo: Correo | null }>) : null))
      .then((d) => {
        if (!d?.correo) return;
        setCorreo(d.correo);
        setProveedor(proveedorDe(d.correo.host));
        setSeguridad(d.correo.seguro ? "ssl" : "starttls");
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
  }, [endpoint]);

  function elegirProveedor(p: Proveedor) {
    setProveedor(p);
    setEstado(null);
    if (p === "smtp") {
      // Al pasar a SMTP propio se deja el servidor vacío para que lo escriban.
      if (proveedorDe(form.host) !== "smtp") setForm((f) => ({ ...f, host: "", puerto: "587" }));
      setSeguridad("starttls");
      return;
    }
    setForm((f) => ({ ...f, host: PROVEEDORES[p].host, puerto: String(PROVEEDORES[p].puerto) }));
    setSeguridad("ssl");
  }

  function elegirSeguridad(v: "ssl" | "starttls") {
    setSeguridad(v);
    setForm((f) => ({ ...f, puerto: v === "ssl" ? "465" : "587" }));
  }

  async function guardar() {
    setGuardando(true);
    setEstado(null);
    const puerto = Number(form.puerto) || (seguridad === "ssl" ? 465 : 587);
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host: form.host.trim(),
        puerto,
        seguro: proveedor === "smtp" ? seguridad === "ssl" : true,
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
        {titulo}:{" "}
        <span className={correo ? "text-text-2" : "text-amber-600"}>{correo ? correo.usuario : pista}</span>
        <span className="ml-auto text-xs text-text-3">{abierto ? "Cerrar" : "Configurar"}</span>
      </button>
      {abierto && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {nota && <p className="text-sm sm:col-span-2">{nota}</p>}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mc-proveedor">Proveedor de correo</Label>
            <select
              id="mc-proveedor"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={proveedor}
              onChange={(e) => elegirProveedor(e.target.value as Proveedor)}
            >
              <option value="yahoo">{PROVEEDORES.yahoo.etiqueta}</option>
              <option value="google">{PROVEEDORES.google.etiqueta}</option>
              <option value="smtp">Otro servidor SMTP</option>
            </select>
          </div>
          <p className="text-xs text-text-2 sm:col-span-2">
            {proveedor === "yahoo" && (
              <>
                Servidor <span className="font-mono">smtp.bizmail.yahoo.com</span>, puerto 465. La contraseña NO es
                la de tu correo: genera una <strong>contraseña de aplicación</strong> en Yahoo → Información de la
                cuenta → Seguridad de la cuenta → Generar contraseña de aplicación.
              </>
            )}
            {proveedor === "google" && (
              <>
                Servidor <span className="font-mono">smtp.gmail.com</span>, puerto 465. Usa una{" "}
                <strong>contraseña de aplicación</strong>: en tu cuenta de Google → Seguridad → activa la
                Verificación en 2 pasos → Contraseñas de aplicaciones → crea una para «Syrtel CRM». Si tu empresa
                usa Google Workspace y no aparece la opción, pídele al administrador de Workspace que la permita.
              </>
            )}
            {proveedor === "smtp" && (
              <>
                Escribe los datos que te dio tu proveedor de correo o de hosting (cPanel, Microsoft 365, Zoho,
                etc.): servidor, puerto y tipo de seguridad. El usuario casi siempre es el correo completo.
              </>
            )}{" "}
            La contraseña se guarda cifrada y el CRM prueba la conexión antes de guardarla.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="mc-usuario">Tu correo corporativo</Label>
            <Input id="mc-usuario" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} placeholder="nombre@empresa.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-clave">
              {proveedor === "smtp"
                ? correo
                  ? "Nueva contraseña (opcional)"
                  : "Contraseña"
                : correo
                  ? "Nueva contraseña de aplicación (opcional)"
                  : "Contraseña de aplicación"}
            </Label>
            <Input id="mc-clave" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore value={form.clave} onChange={(e) => setForm({ ...form, clave: e.target.value })} />
          </div>
          {proveedor === "smtp" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mc-host">Servidor SMTP</Label>
                <Input id="mc-host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="mail.empresa.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mc-seguridad">Seguridad</Label>
                  <select
                    id="mc-seguridad"
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={seguridad}
                    onChange={(e) => elegirSeguridad(e.target.value as "ssl" | "starttls")}
                  >
                    <option value="ssl">SSL/TLS</option>
                    <option value="starttls">STARTTLS</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mc-puerto">Puerto</Label>
                  <Input id="mc-puerto" inputMode="numeric" value={form.puerto} onChange={(e) => setForm({ ...form, puerto: e.target.value })} />
                </div>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mc-nombre">Nombre del remitente</Label>
            <Input id="mc-nombre" value={form.nombreRemitente} onChange={(e) => setForm({ ...form, nombreRemitente: e.target.value })} placeholder="Juan Pérez — Mi empresa" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mc-firma">Firma</Label>
            <Textarea id="mc-firma" rows={3} value={form.firma} onChange={(e) => setForm({ ...form, firma: e.target.value })} placeholder={"Juan Pérez\nAsesor comercial · Mi empresa\nCel. 300 000 0000"} />
          </div>
          {estado && (
            <p className={`text-sm sm:col-span-2 ${estado.tipo === "ok" ? "text-emerald-600" : "text-destructive"}`}>{estado.texto}</p>
          )}
          <div className="sm:col-span-2">
            <Button size="sm" onClick={() => void guardar()} disabled={guardando || !form.usuario.trim() || !form.host.trim() || (!correo && !form.clave)}>
              {guardando ? "Comprobando…" : "Probar y guardar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
