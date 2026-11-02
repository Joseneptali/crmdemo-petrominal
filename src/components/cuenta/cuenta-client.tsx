"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Petrominal — Mi cuenta: cambiar la contraseña propia. */
export function CuentaClient({ nombre, correo, rol }: { nombre: string; correo: string; rol: string }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cambiar() {
    if (nueva !== repetir) {
      setAviso({ tipo: "error", texto: "Las contraseñas nuevas no coinciden" });
      return;
    }
    setGuardando(true);
    setAviso(null);
    const res = await fetch("/api/mi-cuenta/clave", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actual, nueva }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setAviso({ tipo: "error", texto: d?.error?.message ?? "No se pudo cambiar la contraseña" });
      return;
    }
    setActual("");
    setNueva("");
    setRepetir("");
    setAviso({ tipo: "ok", texto: "Contraseña cambiada. Se cerraron tus otras sesiones abiertas." });
  }

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Mi cuenta</CardTitle>
          <CardDescription>
            {nombre} · {correo} ·{" "}
            {rol === "owner" ? "Propietario" : rol === "admin" ? "Administrador" : "Asesor comercial"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4" /> Cambiar contraseña
          </h3>
          <div className="space-y-1.5">
            <Label htmlFor="c-actual">Contraseña actual</Label>
            <Input id="c-actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-nueva">Nueva contraseña (mínimo 8 caracteres)</Label>
            <Input id="c-nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-repetir">Repite la nueva contraseña</Label>
            <Input id="c-repetir" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
          </div>
          {aviso && (
            <p className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-600" : "text-destructive"}`}>{aviso.texto}</p>
          )}
          <Button onClick={() => void cambiar()} disabled={guardando || !actual || nueva.length < 8 || !repetir}>
            {guardando ? "Cambiando…" : "Cambiar contraseña"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
