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
      </CardContent>
    </Card>
  );
}
