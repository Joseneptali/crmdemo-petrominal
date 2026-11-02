"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Conexion = {
  accountRef: string;
  displayName: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
  hasWebhookSecret: boolean;
};
type Estado = { connection: Conexion | null; webhookUrl: string | null };
type Candidata = { id: string; name: string };

/**
 * Petrominal — conectar WhatsApp por Zernio, para quien aún no es Tech Provider
 * de Meta. Se pega la API key (y, si Zernio lo da, el secreto de firma del
 * webhook) y el CRM encuentra el número en Zernio.
 */
export function ZernioWhatsappCard() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [token, setToken] = useState("");
  const [secreto, setSecreto] = useState("");
  const [candidatas, setCandidatas] = useState<Candidata[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/settings/whatsapp-zernio").catch(() => null);
    if (res?.ok) setEstado((await res.json()) as Estado);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(accountRef?: string) {
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/settings/whatsapp-zernio", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: token.trim(),
        accountRef: accountRef ?? null,
        webhookSecret: secreto.trim() || null,
      }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as {
        error?: { message?: string; details?: { accounts?: Candidata[] } };
      } | null;
      setCandidatas(d?.error?.details?.accounts ?? []);
      setError(d?.error?.message ?? "No se pudo conectar. Intenta de nuevo.");
      return;
    }
    setToken("");
    setSecreto("");
    setCandidatas([]);
    void cargar();
  }

  async function desconectar() {
    if (!window.confirm("¿Desconectar WhatsApp por Zernio? Dejarán de entrar y salir mensajes.")) return;
    const res = await fetch("/api/settings/whatsapp-zernio", { method: "DELETE" }).catch(() => null);
    if (res?.ok) void cargar();
  }

  async function copiar() {
    if (!estado?.webhookUrl) return;
    await navigator.clipboard.writeText(estado.webhookUrl).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const c = estado?.connection;

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>WhatsApp por Zernio</CardTitle>
        <CardDescription>
          Para conectar el número sin ser Tech Provider de Meta. Conecta primero el número en tu
          panel de Zernio; aquí pegas la API key y el CRM lo encuentra. Por ahora, desde el CRM se
          envía texto (las cotizaciones en PDF y las plantillas van en la siguiente fase).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {c && (
          <div className="flex items-start gap-2 rounded-md border bg-subtle p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {c.status === "connected" ? "Conectado" : "Hay que reconectar"}: {c.displayName ?? c.accountRef}
              </p>
              <p className="text-xs text-text-2">
                Llave ••••{c.tokenLast4} ·{" "}
                {c.hasWebhookSecret ? "firma del webhook verificada" : "sin secreto de firma guardado"}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void desconectar()}>
              Desconectar
            </Button>
          </div>
        )}

        {estado?.webhookUrl && (
          <div className="space-y-1.5">
            <Label>URL del webhook (pégala en Zernio → Webhooks, evento «message.received»)</Label>
            <div className="flex gap-2">
              <Input readOnly value={estado.webhookUrl} className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => void copiar()}>
                <Copy className="h-4 w-4" /> {copiado ? "Copiada" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-text-3">Trátala como una contraseña: lleva un segmento secreto.</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="zw-token">{c ? "Nueva API key de Zernio" : "API key de Zernio"}</Label>
            <Input
              id="zw-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sk_…"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zw-secret">Secreto de firma del webhook (opcional)</Label>
            <Input
              id="zw-secret"
              type="password"
              value={secreto}
              onChange={(e) => setSecreto(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className={candidatas.length > 0 ? "text-sm font-medium" : "text-sm text-destructive"}>
            {error}
          </p>
        )}
        {candidatas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {candidatas.map((k) => (
              <Button key={k.id} size="sm" variant="outline" disabled={guardando} onClick={() => void guardar(k.id)}>
                {k.name}
              </Button>
            ))}
          </div>
        )}

        <Button onClick={() => void guardar()} disabled={guardando || token.trim().length === 0}>
          {guardando ? "Conectando…" : c ? "Actualizar conexión" : "Conectar WhatsApp por Zernio"}
        </Button>
      </CardContent>
    </Card>
  );
}
