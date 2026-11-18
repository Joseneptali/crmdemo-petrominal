"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Member = {
  id: string;
  userId: string;
  role: string;
  name: string;
  email: string;
  createdAt: string;
};

export function TeamClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [rol, setRol] = useState<"member" | "admin">("member");
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [yo, setYo] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<Member | null>(null);
  const [reasignarA, setReasignarA] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/team").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { members: Member[]; puedeGestionar?: boolean; yo?: string };
    setMembers(data.members);
    setPuedeGestionar(Boolean(data.puedeGestionar));
    setYo(data.yo ?? null);
  }, []);

  async function cambiarRol(memberId: string, role: "member" | "admin") {
    const res = await fetch("/api/settings/team", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId, role }),
    }).catch(() => null);
    if (!res?.ok) setError("No se pudo cambiar el rol");
    void refetch();
  }

  useEffect(() => {
    void refetch();
  }, [refetch]);

  /** Syrtel — quita al usuario del equipo; sus datos se quedan. */
  async function eliminar() {
    if (!eliminando) return;
    setBorrando(true);
    setError(null);
    const res = await fetch("/api/settings/team", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId: eliminando.id, reasignarA: reasignarA || null }),
    }).catch(() => null);
    setBorrando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(d?.error?.message ?? "No se pudo eliminar el usuario");
      return;
    }
    const d = (await res.json()) as { clientes: number };
    const destino = members.find((m) => m.userId === reasignarA)?.name;
    setAviso(
      `Se eliminó a ${eliminando.name}. ` +
        (d.clientes === 0
          ? "No tenía clientes asignados."
          : destino
            ? `Sus ${d.clientes} clientes pasaron a ${destino}.`
            : `Sus ${d.clientes} clientes quedaron sin asesor.`) +
        " Sus conversaciones, cotizaciones y reuniones se conservan."
    );
    setEliminando(null);
    setReasignarA("");
    void refetch();
  }

  function generatePassword() {
    const alphabet =
      "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setTempPassword(
      Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
    );
  }

  async function create() {
    setSaving(true);
    setError(null);
    setCreated(null);
    const res = await fetch("/api/settings/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password: tempPassword, role: rol }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear la cuenta");
      return;
    }
    setCreated({ email, password: tempPassword });
    setName("");
    setEmail("");
    setTempPassword("");
    void refetch();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Crear cuenta de equipo</CardTitle>
          <CardDescription>
            Sin correos ni invitaciones: comparte tú mismo la contraseña
            temporal con tu compañero (se muestra UNA sola vez).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Nombre</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-email">Correo</Label>
              <Input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-rol">Rol</Label>
            <select
              id="team-rol"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm md:w-80"
              value={rol}
              onChange={(e) => setRol(e.target.value as "member" | "admin")}
            >
              <option value="member">Asesor comercial: ve solo sus clientes y sus ventas</option>
              <option value="admin">Administrador: ve toda la operación y configura</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-password">Contraseña temporal</Label>
            <div className="flex gap-2">
              <Input
                id="team-password"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                placeholder="mínimo 8 caracteres"
              />
              <Button variant="outline" onClick={generatePassword}>
                Generar
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {created && (
            <div className="rounded-md border border-success-soft bg-success-tint p-3 text-sm">
              <p className="font-medium text-success-text">Cuenta creada ✓</p>
              <p className="mt-1 text-success-text opacity-90">
                Comparte estos datos ahora (no se volverán a mostrar):
                <br />
                <code>{created.email}</code> · contraseña{" "}
                <code>{created.password}</code>
              </p>
            </div>
          )}
          <Button
            disabled={
              saving || !name.trim() || !email.trim() || tempPassword.length < 8
            }
            onClick={() => void create()}
          >
            <UserPlus className="h-4 w-4" />
            {saving ? "Creando…" : "Crear cuenta"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Miembros
        </p>
        {aviso && <p className="text-sm text-emerald-600">{aviso}</p>}
        {members.map((m) => (
          <div key={m.id} className="rounded-lg border bg-card">
          <div className="flex items-center gap-3 px-4 py-3">
            <ContactAvatar name={m.name} seed={m.id} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </div>
            {puedeGestionar && m.role !== "owner" ? (
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={m.role === "admin" ? "admin" : "member"}
                onChange={(e) => void cambiarRol(m.id, e.target.value as "member" | "admin")}
                aria-label={`Rol de ${m.name}`}
              >
                <option value="member">Asesor</option>
                <option value="admin">Administrador</option>
              </select>
            ) : (
              <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                {m.role === "owner" ? "Propietario" : m.role === "admin" ? "Administrador" : "Asesor"}
              </Badge>
            )}
            {puedeGestionar && m.role !== "owner" && m.userId !== yo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEliminando(m);
                  setReasignarA("");
                  setAviso(null);
                }}
                aria-label={`Eliminar a ${m.name}`}
                title="Eliminar usuario"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          {eliminando?.id === m.id && (
            <div className="space-y-3 border-t bg-subtle px-4 py-3 text-sm">
              <p>
                <strong>¿Eliminar a {m.name}?</strong> Ya no podrá entrar al CRM. No se borra ningún dato: sus
                conversaciones, notas, cotizaciones y reuniones se conservan con su nombre.
              </p>
              <label className="flex flex-wrap items-center gap-2">
                <span>Sus clientes pasan a:</span>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={reasignarA}
                  onChange={(e) => setReasignarA(e.target.value)}
                  aria-label="Pasar sus clientes a"
                >
                  <option value="">Sin asesor (los atiende la administración)</option>
                  {members
                    .filter((o) => o.userId !== m.userId)
                    .map((o) => (
                      <option key={o.userId} value={o.userId}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
              {error && <p className="text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => void eliminar()} disabled={borrando}>
                  {borrando ? "Eliminando…" : "Eliminar usuario"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEliminando(null)} disabled={borrando}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          </div>
        ))}
      </div>
    </div>
  );
}
