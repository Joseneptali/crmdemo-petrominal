"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EquipoDto } from "@/lib/asesores";

/**
 * Petrominal — quién recibe los clientes nuevos o sin asesor. La IA le
 * transfiere esas conversaciones y él decide a qué asesor asignarlas.
 */
export function AdminPrincipalCard() {
  const [equipo, setEquipo] = useState<EquipoDto | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cliente, setCliente] = useState<{ firmarMensajes: boolean; presentarAsesor: boolean } | null>(null);

  useEffect(() => {
    void fetch("/api/ajustes-cliente")
      .then((r) => (r.ok ? (r.json() as Promise<{ ajustes: { firmarMensajes: boolean; presentarAsesor: boolean } }>) : null))
      .then((d) => setCliente(d?.ajustes ?? null))
      .catch(() => null);
  }, []);

  async function cambiarCliente(patch: Partial<{ firmarMensajes: boolean; presentarAsesor: boolean }>) {
    if (!cliente) return;
    const nuevo = { ...cliente, ...patch };
    setCliente(nuevo);
    await fetch("/api/ajustes-cliente", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nuevo),
    }).catch(() => null);
  }

  useEffect(() => {
    void fetch("/api/equipo")
      .then((r) => (r.ok ? (r.json() as Promise<EquipoDto>) : null))
      .then(setEquipo)
      .catch(() => null);
  }, []);

  async function cambiar(userId: string) {
    setMensaje(null);
    const res = await fetch("/api/equipo", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminPrincipalUserId: userId }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setMensaje(d?.error?.message ?? "No se pudo guardar.");
      return;
    }
    const d = (await res.json()) as { adminPrincipal: EquipoDto["adminPrincipal"] };
    setEquipo((e) => (e ? { ...e, adminPrincipal: d.adminPrincipal } : e));
    setMensaje("Guardado.");
  }

  if (!equipo?.puedeAsignar) return null;

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Administrador principal</CardTitle>
        <CardDescription>
          Recibe los clientes nuevos o sin asesor: la IA le transfiere esas conversaciones y él
          decide a qué asesor asignarlas (desde el panel del cliente en la Bandeja). Los asesores
          se agregan abajo con el rol de miembro y cada uno ve solo su cartera.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <select
          className="h-9 min-w-[16rem] rounded-md border bg-background px-2 text-sm"
          value={equipo.adminPrincipal?.userId ?? ""}
          onChange={(e) => void cambiar(e.target.value)}
          aria-label="Administrador principal"
        >
          {equipo.miembros.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.nombre} ({m.email})
            </option>
          ))}
        </select>
        {mensaje && <span className="text-sm text-text-2">{mensaje}</span>}
        {cliente && (
          <div className="w-full space-y-2 border-t pt-3 text-sm">
            <p className="font-medium">Lo que ve el cliente</p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={cliente.presentarAsesor}
                onChange={(e) => void cambiarCliente({ presentarAsesor: e.target.checked })}
              />
              <span>
                <strong>Presentar al asesor:</strong> al asignar un asesor (o cuando la IA le pasa el chat), el
                cliente recibe por WhatsApp «Su asesor comercial asignado es <em>nombre</em>».
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={cliente.firmarMensajes}
                onChange={(e) => void cambiarCliente({ firmarMensajes: e.target.checked })}
              />
              <span>
                <strong>Firmar los mensajes:</strong> cada mensaje que envía un asesor lleva su nombre arriba
                en negrita, para que el cliente sepa quién le escribe.
              </span>
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
