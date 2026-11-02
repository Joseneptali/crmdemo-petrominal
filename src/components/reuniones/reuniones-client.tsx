"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fechaReunion, type ReunionDto } from "@/lib/reuniones";
import { MiCorreoCard } from "@/components/cotizaciones/mi-correo-card";

type ContactoLite = { id: string; name: string; phone: string | null };

const VACIO = {
  titulo: "Reunión comercial Petrominal",
  inicio: "",
  duracionMin: 30,
  lugar: "",
  notas: "",
  correoCliente: "",
  invitarPorCorreo: true,
  avisarPorWhatsapp: true,
};

/** Petrominal — reuniones de los asesores con invitación y recordatorios. */
export function ReunionesClient({ contactoInicial }: { contactoInicial?: string }) {
  const [lista, setLista] = useState<ReunionDto[] | null>(null);
  const [form, setForm] = useState<typeof VACIO | null>(null);
  const [cliente, setCliente] = useState<ContactoLite | null>(null);
  const [q, setQ] = useState("");
  const [contactos, setContactos] = useState<ContactoLite[]>([]);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/reuniones").catch(() => null);
    if (res?.ok) setLista(((await res.json()) as { reuniones: ReunionDto[] }).reuniones);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!contactoInicial) return;
    void fetch(`/api/contacts/${contactoInicial}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ contact: ContactoLite }>) : null))
      .then((d) => {
        if (d?.contact) {
          setCliente(d.contact);
          setForm({ ...VACIO });
        }
      })
      .catch(() => null);
  }, [contactoInicial]);

  useEffect(() => {
    if (!form || cliente) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/contacts?q=${encodeURIComponent(q)}`).catch(() => null);
      if (res?.ok) setContactos(((await res.json()) as { contacts: ContactoLite[] }).contacts.slice(0, 10));
    }, 250);
    return () => clearTimeout(t);
  }, [q, form, cliente]);

  async function programar() {
    if (!form || !cliente) return;
    setGuardando(true);
    setAviso(null);
    const res = await fetch("/api/reuniones", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactId: cliente.id,
        titulo: form.titulo,
        inicio: new Date(form.inicio).toISOString(),
        duracionMin: form.duracionMin,
        lugar: form.lugar || null,
        notas: form.notas || null,
        correoCliente: form.correoCliente || null,
        invitarPorCorreo: form.invitarPorCorreo,
        avisarPorWhatsapp: form.avisarPorWhatsapp,
      }),
    }).catch(() => null);
    setGuardando(false);
    const d = (await res?.json().catch(() => null)) as
      | { reunion?: ReunionDto; error?: { message?: string } }
      | null;
    if (!res?.ok || !d?.reunion) {
      setAviso({ tipo: "error", texto: d?.error?.message ?? "No se pudo programar" });
      return;
    }
    const inv = d.reunion.invitacion ?? {};
    const partes = [
      inv.correoCliente ? `correo: ${String(inv.correoCliente)}` : null,
      inv.whatsapp ? `WhatsApp: ${String(inv.whatsapp)}` : null,
    ].filter(Boolean);
    setAviso({ tipo: "ok", texto: `Reunión programada. ${partes.join(" · ")}` });
    setForm(null);
    setCliente(null);
    void cargar();
  }

  async function estado(r: ReunionDto, nuevo: "realizada" | "cancelada") {
    if (nuevo === "cancelada" && !window.confirm("¿Cancelar la reunión? Se le avisará al cliente.")) return;
    const res = await fetch(`/api/reuniones/${r.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado: nuevo }),
    }).catch(() => null);
    if (res?.ok) void cargar();
  }

  const ahora = Date.now();
  const proximas = (lista ?? []).filter((r) => r.estado === "programada" && Date.parse(r.inicio) >= ahora - 3600_000);
  const otras = (lista ?? []).filter((r) => !proximas.includes(r));

  return (
    <div className="max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Reuniones</CardTitle>
          <CardDescription>
            Programa reuniones con tus clientes. La invitación sale por tu correo (con el evento para su
            calendario) y por WhatsApp; el CRM envía recordatorios 24 horas y 1 hora antes al cliente y a ti.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MiCorreoCard />
          {aviso && <p className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p>}

          {!form ? (
            <Button onClick={() => setForm({ ...VACIO })}>
              <CalendarClock className="h-4 w-4" /> Programar reunión
            </Button>
          ) : (
            <div className="grid gap-3 rounded-md border bg-subtle p-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Cliente</Label>
                {cliente ? (
                  <div className="flex items-center gap-2 text-sm">
                    <strong>{cliente.name}</strong>
                    {cliente.phone && <span className="text-text-3">+{cliente.phone}</span>}
                    <Button size="sm" variant="ghost" onClick={() => setCliente(null)}>Cambiar</Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-3" />
                      <Input className="pl-8" placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />
                    </div>
                    <ul className="max-h-48 divide-y overflow-y-auto rounded-md border bg-background">
                      {contactos.map((c) => (
                        <li key={c.id}>
                          <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setCliente(c)}>
                            {c.name} <span className="text-xs text-text-3">{c.phone ? `+${c.phone}` : ""}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="r-titulo">Asunto</Label>
                <Input id="r-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-inicio">Fecha y hora (Colombia)</Label>
                <Input id="r-inicio" type="datetime-local" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-dur">Duración (minutos)</Label>
                <Input id="r-dur" type="number" min={10} step={5} value={form.duracionMin} onChange={(e) => setForm({ ...form, duracionMin: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-lugar">Lugar o enlace de videollamada</Label>
                <Input id="r-lugar" value={form.lugar} onChange={(e) => setForm({ ...form, lugar: e.target.value })} placeholder="Oficina Petrominal / https://meet…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-correo">Correo del cliente</Label>
                <Input id="r-correo" value={form.correoCliente} onChange={(e) => setForm({ ...form, correoCliente: e.target.value })} placeholder="Si se deja vacío, el de su ficha" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="r-notas">Notas para el cliente</Label>
                <Textarea id="r-notas" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.invitarPorCorreo} onChange={(e) => setForm({ ...form, invitarPorCorreo: e.target.checked })} />
                Invitar por correo (con evento de calendario)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.avisarPorWhatsapp} onChange={(e) => setForm({ ...form, avisarPorWhatsapp: e.target.checked })} />
                Avisar por WhatsApp
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <Button onClick={() => void programar()} disabled={guardando || !cliente || !form.inicio || !form.titulo.trim()}>
                  {guardando ? "Programando…" : "Programar y enviar invitación"}
                </Button>
                <Button variant="ghost" onClick={() => { setForm(null); setCliente(null); }}>Cancelar</Button>
              </div>
            </div>
          )}

          <h3 className="kicker text-text-2">Próximas</h3>
          {lista === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : proximas.length === 0 ? (
            <p className="text-sm text-text-2">No hay reuniones próximas.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {proximas.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <CalendarClock className="h-4 w-4 text-text-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.titulo} · {r.contacto.nombre}</p>
                    <p className="truncate text-xs text-text-2">
                      {fechaReunion(r.inicio)} · {r.duracionMin} min{r.lugar ? ` · ${r.lugar}` : ""}{r.asesor ? ` · ${r.asesor.nombre}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void estado(r, "realizada")}><Check className="h-4 w-4" /> Realizada</Button>
                  <Button size="sm" variant="ghost" onClick={() => void estado(r, "cancelada")}><X className="h-4 w-4" /> Cancelar</Button>
                </li>
              ))}
            </ul>
          )}

          {otras.length > 0 && (
            <>
              <h3 className="kicker text-text-2">Recientes</h3>
              <ul className="divide-y rounded-md border">
                {otras.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm text-text-2">
                    <span className="min-w-0 flex-1 truncate">{fechaReunion(r.inicio)} · {r.titulo} · {r.contacto.nombre}</span>
                    <span className={r.estado === "cancelada" ? "text-destructive" : r.estado === "realizada" ? "text-emerald-600" : ""}>{r.estado}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
