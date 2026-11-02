"use client";

import { useCallback, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import type { EquipoDto, MiembroDto } from "@/lib/asesores";

/**
 * Petrominal — el asesor dueño del cliente. La administración lo asigna desde
 * aquí; un asesor solo lo ve.
 */
export function AsesorCard({ contactId, refreshKey = 0 }: { contactId: string; refreshKey?: number }) {
  const [equipo, setEquipo] = useState<EquipoDto | null>(null);
  const [asesor, setAsesor] = useState<MiembroDto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [e, c] = await Promise.all([
      fetch("/api/equipo").then((r) => (r.ok ? (r.json() as Promise<EquipoDto>) : null)).catch(() => null),
      fetch(`/api/contacts/${contactId}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ asesor?: MiembroDto | null }>) : null))
        .catch(() => null),
    ]);
    setEquipo(e);
    setAsesor(c?.asesor ?? null);
  }, [contactId]);

  useEffect(() => {
    void cargar();
  }, [cargar, refreshKey]);

  async function asignar(userId: string) {
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contactId}/asesor`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asesorUserId: userId || null }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      setError("No se pudo asignar el asesor.");
      return;
    }
    const d = (await res.json()) as { asesor: MiembroDto | null };
    setAsesor(d.asesor);
  }

  if (!equipo) return null;

  return (
    <section className="border-b p-4" data-testid="asesor-card">
      <h3 className="kicker mb-2 flex items-center gap-1.5 text-text-2">
        <UserRound className="h-3.5 w-3.5" /> Asesor comercial
      </h3>
      {equipo.puedeAsignar ? (
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={asesor?.userId ?? ""}
          disabled={guardando}
          onChange={(e) => void asignar(e.target.value)}
          aria-label="Asesor asignado"
        >
          <option value="">
            Sin asesor (lo atiende {equipo.adminPrincipal?.nombre ?? "el administrador"})
          </option>
          {equipo.miembros.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.nombre} {m.rol === "member" ? "" : "· administración"}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm">{asesor ? asesor.nombre : "Sin asesor asignado"}</p>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </section>
  );
}
