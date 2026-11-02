"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DIAS, describirHorario, type Horario } from "@/lib/horario";

type Ajustes = { activo: boolean; modo: "mensaje" | "ia"; horario: Horario; mensaje: string };

/** Petrominal — horario de atención y qué pasa fuera de él. */
export function HorarioCard() {
  const [aj, setAj] = useState<Ajustes | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void fetch("/api/horario")
      .then((r) => (r.ok ? (r.json() as Promise<{ horario: Ajustes; puedeEditar: boolean }>) : null))
      .then((d) => {
        if (!d) return;
        setAj(d.horario);
        setPuedeEditar(d.puedeEditar);
      })
      .catch(() => null);
  }, []);

  if (!aj) return null;

  const cambiarDia = (dia: string, abierto: boolean) => {
    const h = { ...aj.horario };
    if (abierto) h[dia] = h[dia] ?? ["08:00", "17:30"];
    else delete h[dia];
    setAj({ ...aj, horario: h });
  };
  const cambiarHora = (dia: string, i: 0 | 1, v: string) => {
    const t = [...(aj.horario[dia] ?? ["08:00", "17:30"])] as [string, string];
    t[i] = v;
    setAj({ ...aj, horario: { ...aj.horario, [dia]: t } });
  };

  async function guardar() {
    if (!aj) return;
    setGuardando(true);
    setAviso(null);
    const res = await fetch("/api/horario", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activo: aj.activo, modo: aj.modo, horario: aj.horario, mensaje: aj.mensaje }),
    }).catch(() => null);
    setGuardando(false);
    setAviso(res?.ok ? "Horario guardado." : "No se pudo guardar.");
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Horario de atención</CardTitle>
        <CardDescription>
          Hora de Colombia. Fuera de horario puedes solo avisarle al cliente el horario, o dejar que la IA
          lo atienda y tome sus datos; en los dos casos queda una nota para su asesor (o para el
          administrador principal si es nuevo).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch label="Horario de atención encendido" checked={aj.activo} disabled={!puedeEditar} onCheckedChange={(v) => setAj({ ...aj, activo: v })} />
          {aj.activo ? "Horario encendido" : "Apagado: se atiende a toda hora"}
        </label>

        <div className="space-y-1.5">
          {DIAS.map(([clave, nombre]) => {
            const t = aj.horario[clave];
            return (
              <div key={clave} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex w-32 items-center gap-2">
                  <input type="checkbox" checked={!!t} disabled={!puedeEditar} onChange={(e) => cambiarDia(clave, e.target.checked)} />
                  {nombre}
                </label>
                {t ? (
                  <>
                    <Input type="time" className="h-8 w-28" value={t[0]} disabled={!puedeEditar} onChange={(e) => cambiarHora(clave, 0, e.target.value)} />
                    <span>a</span>
                    <Input type="time" className="h-8 w-28" value={t[1]} disabled={!puedeEditar} onChange={(e) => cambiarHora(clave, 1, e.target.value)} />
                  </>
                ) : (
                  <span className="text-text-3">Cerrado</span>
                )}
              </div>
            );
          })}
          <p className="text-xs text-text-3">Resumen: {describirHorario(aj.horario) || "sin días de atención"}</p>
        </div>

        <div className="space-y-2">
          <Label>Fuera de horario</Label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="modo" checked={aj.modo === "ia"} disabled={!puedeEditar} onChange={() => setAj({ ...aj, modo: "ia" })} />
            <span><strong>La IA atiende:</strong> responde, toma los datos del cliente y le dice que un asesor lo contactará en horario hábil.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="modo" checked={aj.modo === "mensaje"} disabled={!puedeEditar} onChange={() => setAj({ ...aj, modo: "mensaje" })} />
            <span><strong>Solo mensaje:</strong> se envía el aviso de horario (una vez) y nadie responde hasta que abra.</span>
          </label>
        </div>

        {aj.modo === "mensaje" && (
          <div className="space-y-1.5">
            <Label htmlFor="msg-horario">Mensaje fuera de horario</Label>
            <Textarea id="msg-horario" rows={3} value={aj.mensaje} disabled={!puedeEditar} onChange={(e) => setAj({ ...aj, mensaje: e.target.value })} />
            <p className="text-xs text-text-3">
              <span className="font-mono">{"{horario}"}</span> se cambia por el resumen del horario.
            </p>
          </div>
        )}

        {puedeEditar && (
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar horario"}
            </Button>
            {aviso && <span className="text-sm text-text-2">{aviso}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
