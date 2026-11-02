"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatoPesos, numeroCotizacion, type CotizacionResumenDto } from "@/lib/cotizaciones";
import { MiCorreoCard } from "./mi-correo-card";

type ContactoLite = { id: string; name: string; phone: string | null };

/** Petrominal — lista de cotizaciones y alta de una nueva para un cliente. */
export function CotizacionesClient({ contactoInicial }: { contactoInicial?: string }) {
  const router = useRouter();
  const [lista, setLista] = useState<CotizacionResumenDto[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState("");
  const [contactos, setContactos] = useState<ContactoLite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/cotizaciones").catch(() => null);
    if (res?.ok) setLista(((await res.json()) as { cotizaciones: CotizacionResumenDto[] }).cotizaciones);
  }, []);

  const crear = useCallback(
    async (contactId: string) => {
      setError(null);
      const res = await fetch("/api/cotizaciones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId }),
      }).catch(() => null);
      if (!res?.ok) {
        const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(d?.error?.message ?? "No se pudo crear la cotización");
        return;
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/cotizaciones/${id}`);
    },
    [router]
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Desde el panel del cliente: /cotizaciones?contacto=ct_… crea y abre.
  useEffect(() => {
    if (contactoInicial) void crear(contactoInicial);
  }, [contactoInicial, crear]);

  useEffect(() => {
    if (!buscando) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/contacts?q=${encodeURIComponent(q)}`).catch(() => null);
      if (res?.ok) setContactos(((await res.json()) as { contacts: ContactoLite[] }).contacts.slice(0, 12));
    }, 250);
    return () => clearTimeout(t);
  }, [q, buscando]);

  return (
    <div className="max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cotizaciones</CardTitle>
          <CardDescription>
            Arma la cotización con productos del catálogo (todos con foto de referencia), digita los
            precios y envíala por WhatsApp o por tu correo corporativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MiCorreoCard />

          {!buscando ? (
            <Button onClick={() => setBuscando(true)}>
              <Plus className="h-4 w-4" /> Nueva cotización
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border bg-subtle p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-3" />
                <Input
                  autoFocus
                  className="pl-8"
                  placeholder="Buscar cliente por nombre o teléfono"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <ul className="divide-y rounded-md border bg-background">
                {contactos.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => void crear(c.id)}
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-text-3">{c.phone ? `+${c.phone}` : ""}</span>
                    </button>
                  </li>
                ))}
                {contactos.length === 0 && <li className="px-3 py-2 text-sm text-text-3">Sin resultados</li>}
              </ul>
              <Button size="sm" variant="ghost" onClick={() => setBuscando(false)}>
                Cancelar
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {lista === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-text-2">Aún no hay cotizaciones.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {lista.map((c) => (
                <li key={c.id}>
                  <Link href={`/cotizaciones/${c.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent">
                    <FileText className="h-4 w-4 shrink-0 text-text-3" />
                    <span className="w-24 font-mono text-[13px] font-semibold">{numeroCotizacion(c.numero)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{c.contactoNombre}</span>
                    <span className="hidden text-xs text-text-3 sm:block">{c.asesorNombre ?? ""}</span>
                    <span className="w-32 text-right text-sm font-medium">{formatoPesos(c.total, c.moneda)}</span>
                    <span
                      className={`w-20 text-right text-xs ${c.estado === "enviada" ? "text-emerald-600" : "text-amber-600"}`}
                    >
                      {c.estado === "enviada" ? "Enviada" : "Borrador"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
