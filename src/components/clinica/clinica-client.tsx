"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Database, Eye, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADOS_CITA, ETIQUETA_ESTADO, fechaLarga, formatoPesosCO, ZONA_CLINICA, type EstadoCita } from "@/lib/clinica";

type Especialidad = { id: string; nombre: string; descripcion: string | null };
type Profesional = { id: string; nombre: string; tipo: string; especialidadId: string; registro: string | null; horario: Record<string, { start: string; end: string }[]>; duracionMin: number; activo: boolean };
type Eps = { id: string; nombre: string; nit: string | null };
type Servicio = { id: string; contratoId: string; especialidadId: string; procedimientoId: string | null; codigo: string | null; nombre: string; tipo: string; valor: number };
type Procedimiento = { id: string; nombre: string; codigo: string | null; tipo: string; especialidadId: string; duracionMin: number; profesionalIds: string[]; recomendacion: string | null; pdf: string | null };
type Contrato = { id: string; epsId: string; numero: string; topeMensual: number; inicio: string; fin: string; activo: boolean; consumoMes: number; servicios: Servicio[] };
type Paciente = { id: string; contactId: string | null; tipoDocumento: string; documento: string | null; nombres: string; apellidos: string | null; fechaNacimiento: string | null; telefono: string | null; correo: string | null; epsId: string | null; proximaCita: string | null; ultimaAtencion: string | null };
type Cita = { id: string; pacienteId: string; profesionalId: string; especialidadId: string; procedimientoId: string | null; servicioId: string | null; contratoId: string | null; inicio: string; duracionMin: number; valor: number; estado: EstadoCita; origen: string; notas: string | null };
type Datos = { mes: string; hoy: string; puedeConfigurar: boolean; especialidades: Especialidad[]; procedimientos: Procedimiento[]; profesionales: Profesional[]; eps: Eps[]; contratos: Contrato[]; pacientes: Paciente[]; citas: Cita[] };
type Hueco = { startUtc: string; label: string; profesionalIds: string[] };

const PESTANAS = ["Agenda", "Contratos", "Pacientes", "Profesionales"] as const;
type Pestana = (typeof PESTANAS)[number];
const DIAS: Record<string, string> = { mon: "Lun", tue: "Mar", wed: "Mié", thu: "Jue", fri: "Vie", sat: "Sáb", sun: "Dom" };

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: ZONA_CLINICA, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dia = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: ZONA_CLINICA, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const diaClave = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_CLINICA }).format(new Date(iso));
const nombreMes = (mes: string) =>
  new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-15T12:00:00Z`));
const otroMes = (mes: string, delta: number) => {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const edad = (nac: string | null) => {
  if (!nac) return "";
  const n = new Date(`${nac}T12:00:00Z`);
  const h = new Date();
  let e = h.getUTCFullYear() - n.getUTCFullYear();
  if (h.getUTCMonth() < n.getUTCMonth() || (h.getUTCMonth() === n.getUTCMonth() && h.getUTCDate() < n.getUTCDate())) e--;
  return `${e} años`;
};
const COLOR_ESTADO: Record<EstadoCita, string> = {
  agendada: "bg-primary/10 text-primary",
  atendida: "bg-emerald-500/10 text-emerald-700",
  no_asistio: "bg-amber-500/10 text-amber-700",
  cancelada: "bg-muted text-muted-foreground line-through",
};

async function mensaje(res: Response | null, def: string) {
  const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return d?.error?.message ?? def;
}

/** Demo clínica oftalmológica — agenda, contratos con tope, pacientes y profesionales. */
export function ClinicaClient() {
  const [mes, setMes] = useState<string | null>(null);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [pestana, setPestana] = useState<Pestana>("Agenda");
  const [error, setError] = useState<string | null>(null);
  const [cargandoDemo, setCargandoDemo] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/clinica${mes ? `?mes=${mes}` : ""}`).catch(() => null);
    if (!res?.ok) {
      setError(await mensaje(res, "No se pudo cargar la clínica"));
      return;
    }
    const d = (await res.json()) as Datos;
    setDatos(d);
    if (!mes) setMes(d.mes);
    setError(null);
  }, [mes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/clinica", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      setError(await mensaje(res, "No se pudo guardar"));
      return false;
    }
    setError(null);
    await cargar();
    return true;
  }

  async function cargarDemo() {
    setCargandoDemo(true);
    await accion({ accion: "cargarDemo" });
    setCargandoDemo(false);
  }

  if (!datos) return <p className="p-6 text-sm text-muted-foreground">{error ?? "Cargando…"}</p>;

  return (
    <div className="max-w-6xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" /> Clínica Oftalmológica Unidad Láser del Atlántico
          </CardTitle>
          <CardDescription>
            Citas por especialidad, contratos con EPS y su tope mensual. Cada cita agendada suma el valor de su servicio al
            consumo del mes de su contrato; si lo pasaría, se agenda en el mes siguiente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {datos.especialidades.length === 0 && datos.puedeConfigurar && (
            <div className="rounded-md border bg-subtle p-3 text-sm">
              <p className="mb-2">La clínica no tiene datos. Carga los de demostración (especialidades, profesionales, EPS, contratos, pacientes y citas de prueba).</p>
              <Button size="sm" onClick={() => void cargarDemo()} disabled={cargandoDemo}>
                <Database className="h-4 w-4" /> {cargandoDemo ? "Cargando…" : "Cargar datos de demostración"}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1" role="tablist">
              {PESTANAS.map((p) => (
                <Button key={p} size="sm" variant={p === pestana ? "default" : "ghost"} role="tab" aria-selected={p === pestana} onClick={() => setPestana(p)}>
                  {p}
                </Button>
              ))}
            </div>
            {(pestana === "Agenda" || pestana === "Contratos") && mes && (
              <div className="flex items-center gap-1 text-sm">
                <Button size="sm" variant="ghost" onClick={() => setMes(otroMes(mes, -1))} aria-label="Mes anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[9rem] text-center font-medium capitalize">{nombreMes(mes)}</span>
                <Button size="sm" variant="ghost" onClick={() => setMes(otroMes(mes, 1))} aria-label="Mes siguiente">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {pestana === "Agenda" && <Agenda datos={datos} accion={accion} />}
      {pestana === "Contratos" && <Contratos datos={datos} accion={accion} />}
      {pestana === "Pacientes" && <Pacientes datos={datos} accion={accion} />}
      {pestana === "Profesionales" && <Profesionales datos={datos} />}
    </div>
  );
}

type Props = { datos: Datos; accion: (b: Record<string, unknown>) => Promise<boolean> };

function Agenda({ datos, accion }: Props) {
  const [filtroEsp, setFiltroEsp] = useState("");
  const [filtroProf, setFiltroProf] = useState("");
  const [nueva, setNueva] = useState(false);
  const pac = useMemo(() => new Map(datos.pacientes.map((p) => [p.id, p])), [datos.pacientes]);
  const prof = useMemo(() => new Map(datos.profesionales.map((p) => [p.id, p])), [datos.profesionales]);
  const esp = useMemo(() => new Map(datos.especialidades.map((e) => [e.id, e])), [datos.especialidades]);
  const proc = useMemo(() => new Map(datos.procedimientos.map((x) => [x.id, x])), [datos.procedimientos]);
  const epsDe = useMemo(() => {
    const eps = new Map(datos.eps.map((e) => [e.id, e.nombre]));
    return new Map(datos.contratos.map((c) => [c.id, eps.get(c.epsId) ?? ""]));
  }, [datos.eps, datos.contratos]);
  const citas = datos.citas.filter((c) => (!filtroEsp || c.especialidadId === filtroEsp) && (!filtroProf || c.profesionalId === filtroProf));
  const porDia = new Map<string, Cita[]>();
  for (const c of citas) {
    const k = diaClave(c.inicio);
    porDia.set(k, [...(porDia.get(k) ?? []), c]);
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={filtroEsp} onChange={(e) => setFiltroEsp(e.target.value)} aria-label="Especialidad">
            <option value="">Todas las especialidades</option>
            {datos.especialidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={filtroProf} onChange={(e) => setFiltroProf(e.target.value)} aria-label="Profesional">
            <option value="">Todos los profesionales</option>
            {datos.profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <span className="text-sm text-text-2">{citas.length} citas</span>
          <Button size="sm" className="ml-auto" onClick={() => setNueva(!nueva)} disabled={datos.especialidades.length === 0}>
            <CalendarPlus className="h-4 w-4" /> Nueva cita
          </Button>
        </div>

        {nueva && <NuevaCita datos={datos} accion={accion} onListo={() => setNueva(false)} />}

        {porDia.size === 0 ? (
          <p className="text-sm text-text-2">No hay citas este mes con esos filtros.</p>
        ) : (
          [...porDia.entries()].map(([k, lista]) => (
            <section key={k} className="space-y-1">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${k === datos.hoy ? "text-primary" : "text-text-3"}`}>
                {dia(lista[0]!.inicio)} {k === datos.hoy && "· hoy"}
              </h3>
              <ul className="divide-y rounded-md border">
                {lista.map((c) => {
                  const p = pac.get(c.pacienteId);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                      <span className="w-20 shrink-0 font-mono text-xs">{hora(c.inicio)}</span>
                      <span className="min-w-[12rem] flex-1">
                        <strong>{p ? `${p.nombres} ${p.apellidos ?? ""}` : "—"}</strong>
                        <span className="block text-xs text-text-2">
                          {p?.tipoDocumento} {p?.documento} · {c.contratoId ? epsDe.get(c.contratoId) : "Particular"}
                          {c.origen === "ia" && " · agendada por la IA"}
                        </span>
                      </span>
                      <span className="min-w-[12rem] flex-1 text-xs">
                        {c.procedimientoId ? (
                          <>
                            <span className="mr-1 rounded bg-sky-500/10 px-1 text-[10px] text-sky-700">Examen</span>
                            {proc.get(c.procedimientoId)?.nombre}
                          </>
                        ) : (
                          `Consulta · ${esp.get(c.especialidadId)?.nombre ?? ""}`
                        )}
                        <span className="block text-text-2">{prof.get(c.profesionalId)?.nombre}</span>
                      </span>
                      <span className="w-24 text-right font-mono text-xs">{formatoPesosCO(c.valor)}</span>
                      <select
                        className={`h-8 rounded-md border px-2 text-xs ${COLOR_ESTADO[c.estado]}`}
                        value={c.estado}
                        onChange={(e) => void accion({ accion: "estadoCita", id: c.id, estado: e.target.value })}
                        aria-label="Estado de la cita"
                      >
                        {ESTADOS_CITA.map((s) => (
                          <option key={s} value={s}>
                            {ETIQUETA_ESTADO[s]}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function NuevaCita({ datos, accion, onListo }: Props & { onListo: () => void }) {
  const [busca, setBusca] = useState("");
  const [pacienteId, setPacienteId] = useState("");
  const consultables = datos.especialidades.filter((e) => !/ayudas diagn/i.test(e.nombre));
  const [tipo, setTipo] = useState<"consulta" | "examen">("consulta");
  const [especialidadId, setEspecialidadId] = useState(consultables[0]?.id ?? "");
  const [procedimientoId, setProcedimientoId] = useState(datos.procedimientos[0]?.id ?? "");
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [info, setInfo] = useState<{ valor: number; topeLleno: boolean } | null>(null);
  const [elegido, setElegido] = useState("");
  const [guardando, setGuardando] = useState(false);
  const prof = new Map(datos.profesionales.map((p) => [p.id, p.nombre]));
  const opciones = datos.pacientes.filter((p) =>
    `${p.nombres} ${p.apellidos ?? ""} ${p.documento ?? ""}`.toLowerCase().includes(busca.toLowerCase())
  );

  const procElegido = datos.procedimientos.find((x) => x.id === procedimientoId);
  const espConsulta = tipo === "examen" ? (procElegido?.especialidadId ?? "") : especialidadId;
  const procConsulta = tipo === "examen" ? procedimientoId : "";
  useEffect(() => {
    if (!pacienteId || !espConsulta) return;
    setHuecos(null);
    setElegido("");
    void fetch(
      `/api/clinica/disponibilidad?especialidadId=${espConsulta}&pacienteId=${pacienteId}${procConsulta ? `&procedimientoId=${procConsulta}` : ""}`
    )
      .then((r) => r.json())
      .then((d: { huecos: Hueco[]; valor: number; topeLleno: boolean }) => {
        setHuecos(d.huecos);
        setInfo({ valor: d.valor, topeLleno: d.topeLleno });
      })
      .catch(() => setHuecos([]));
  }, [pacienteId, espConsulta, procConsulta]);

  async function guardar() {
    const [startUtc, profesionalId] = elegido.split("|");
    setGuardando(true);
    const ok = await accion({
      accion: "crearCita",
      pacienteId,
      especialidadId: espConsulta,
      procedimientoId: procConsulta || null,
      startUtc,
      profesionalId,
    });
    setGuardando(false);
    if (ok) onListo();
  }

  return (
    <div className="grid gap-3 rounded-md border bg-subtle p-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="nc-busca">Paciente</Label>
        <Input id="nc-busca" placeholder="Nombre o documento" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} aria-label="Elegir paciente">
          <option value="">Elige el paciente…</option>
          {opciones.slice(0, 50).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombres} {p.apellidos} · {p.documento}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nc-tipo">Tipo de cita</Label>
        <select id="nc-tipo" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as "consulta" | "examen")}>
          <option value="consulta">Consulta de especialidad</option>
          <option value="examen" disabled={datos.procedimientos.length === 0}>
            Examen o procedimiento
          </option>
        </select>
        {tipo === "consulta" ? (
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={especialidadId} onChange={(e) => setEspecialidadId(e.target.value)} aria-label="Especialidad">
            {consultables.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        ) : (
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={procedimientoId} onChange={(e) => setProcedimientoId(e.target.value)} aria-label="Examen o procedimiento">
            {datos.procedimientos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre} ({x.duracionMin} min)
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-text-2">Al agendar, el paciente recibe por WhatsApp y correo la confirmación con las recomendaciones.</p>
        {info && (
          <p className="text-xs text-text-2">
            Valor del servicio: <strong>{formatoPesosCO(info.valor)}</strong>
            {info.topeLleno && <span className="block text-amber-700">El contrato ya completó el cupo de este mes: los horarios son del mes siguiente.</span>}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nc-hora">Día y hora</Label>
        <select id="nc-hora" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={elegido} onChange={(e) => setElegido(e.target.value)} disabled={!huecos}>
          <option value="">{!pacienteId ? "Primero el paciente" : huecos === null ? "Buscando horarios…" : huecos.length === 0 ? "Sin horarios" : "Elige el horario…"}</option>
          {(huecos ?? []).map((h) =>
            h.profesionalIds.map((pid) => (
              <option key={`${h.startUtc}|${pid}`} value={`${h.startUtc}|${pid}`}>
                {fechaLarga(h.startUtc)} · {prof.get(pid)}
              </option>
            ))
          )}
        </select>
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => void guardar()} disabled={!elegido || guardando}>
            {guardando ? "Agendando…" : "Agendar cita"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onListo}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

function Contratos({ datos, accion }: Props) {
  const eps = new Map(datos.eps.map((e) => [e.id, e]));
  const esp = new Map(datos.especialidades.map((e) => [e.id, e.nombre]));
  const [nuevo, setNuevo] = useState<{ epsId: string; numero: string; tope: string; inicio: string; fin: string } | null>(null);
  const [nuevaEps, setNuevaEps] = useState("");

  return (
    <div className="space-y-4">
      {datos.puedeConfigurar && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-2 pt-6">
            <Button size="sm" variant="outline" onClick={() => setNuevo({ epsId: datos.eps[0]?.id ?? "", numero: "", tope: "5000000", inicio: `${datos.mes.slice(0, 4)}-01-01`, fin: `${datos.mes.slice(0, 4)}-12-31` })}>
              <Plus className="h-4 w-4" /> Nuevo contrato
            </Button>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="n-eps">Nueva EPS</Label>
                <Input id="n-eps" value={nuevaEps} onChange={(e) => setNuevaEps(e.target.value)} placeholder="Nombre de la EPS" />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={nuevaEps.trim().length < 2}
                onClick={() => void accion({ accion: "crearEps", nombre: nuevaEps.trim() }).then((ok) => ok && setNuevaEps(""))}
              >
                Agregar EPS
              </Button>
            </div>
          </CardContent>
          {nuevo && (
            <CardContent className="grid gap-3 sm:grid-cols-5">
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={nuevo.epsId} onChange={(e) => setNuevo({ ...nuevo, epsId: e.target.value })} aria-label="EPS">
                {datos.eps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
              <Input placeholder="Número del contrato" value={nuevo.numero} onChange={(e) => setNuevo({ ...nuevo, numero: e.target.value })} />
              <Input placeholder="Tope mensual" inputMode="numeric" value={nuevo.tope} onChange={(e) => setNuevo({ ...nuevo, tope: e.target.value.replace(/\D/g, "") })} />
              <Input type="date" value={nuevo.inicio} onChange={(e) => setNuevo({ ...nuevo, inicio: e.target.value })} aria-label="Inicio" />
              <Input type="date" value={nuevo.fin} onChange={(e) => setNuevo({ ...nuevo, fin: e.target.value })} aria-label="Fin" />
              <div className="flex gap-2 sm:col-span-5">
                <Button
                  size="sm"
                  disabled={!nuevo.epsId || !nuevo.numero.trim() || !Number(nuevo.tope)}
                  onClick={() =>
                    void accion({ accion: "crearContrato", epsId: nuevo.epsId, numero: nuevo.numero.trim(), topeMensual: Number(nuevo.tope), inicio: nuevo.inicio, fin: nuevo.fin }).then(
                      (ok) => ok && setNuevo(null)
                    )
                  }
                >
                  Guardar contrato
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNuevo(null)}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {datos.contratos.map((c) => {
        const pct = Math.min(100, Math.round((c.consumoMes / c.topeMensual) * 100));
        const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {eps.get(c.epsId)?.nombre} · Contrato {c.numero}
              </CardTitle>
              <CardDescription>
                Vigencia {c.inicio} a {c.fin} {!c.activo && "· inactivo"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="capitalize">
                    Consumo de {nombreMes(datos.mes)}: <strong>{formatoPesosCO(c.consumoMes)}</strong> de{" "}
                    {datos.puedeConfigurar ? (
                      <TopeEditable valor={c.topeMensual} onGuardar={(v) => accion({ accion: "editarContrato", id: c.id, topeMensual: v })} />
                    ) : (
                      <strong>{formatoPesosCO(c.topeMensual)}</strong>
                    )}
                  </span>
                  <span className={pct >= 100 ? "font-semibold text-red-600" : "text-text-2"}>
                    {pct}% · disponible {formatoPesosCO(Math.max(0, c.topeMensual - c.consumoMes))}
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-text-3">
                    <th className="py-1">Código</th>
                    <th>Servicio</th>
                    <th>Especialidad</th>
                    <th className="text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {c.servicios.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-1 font-mono text-xs">{s.codigo}</td>
                      <td>{s.procedimientoId ? s.nombre : s.tipo === "control" ? "Consulta de control" : "Consulta de primera vez"}</td>
                      <td className="text-xs">{esp.get(s.especialidadId)}</td>
                      <td className="text-right">
                        {datos.puedeConfigurar ? (
                          <TopeEditable valor={s.valor} onGuardar={(v) => accion({ accion: "editarServicio", id: s.id, valor: v })} />
                        ) : (
                          formatoPesosCO(s.valor)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Un valor en pesos que se edita en el sitio y se guarda al salir del campo. */
function TopeEditable({ valor, onGuardar }: { valor: number; onGuardar: (v: number) => Promise<boolean> }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(String(valor));
  if (!editando) {
    return (
      <button type="button" className="font-semibold underline decoration-dotted underline-offset-2" onClick={() => setEditando(true)} title="Editar">
        {formatoPesosCO(valor)}
      </button>
    );
  }
  return (
    <input
      autoFocus
      className="h-7 w-28 rounded border bg-background px-1 text-right text-sm"
      inputMode="numeric"
      value={texto}
      onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
      onBlur={() => {
        const v = Number(texto);
        setEditando(false);
        if (v > 0 && v !== valor) void onGuardar(v);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label="Valor en pesos"
    />
  );
}

function Pacientes({ datos, accion }: Props) {
  const eps = new Map(datos.eps.map((e) => [e.id, e.nombre]));
  const [busca, setBusca] = useState("");
  const [nuevo, setNuevo] = useState<Record<string, string> | null>(null);
  const lista = datos.pacientes.filter((p) =>
    `${p.nombres} ${p.apellidos ?? ""} ${p.documento ?? ""} ${p.telefono ?? ""}`.toLowerCase().includes(busca.toLowerCase())
  );
  const campos: [string, string][] = [
    ["nombres", "Nombres *"],
    ["apellidos", "Apellidos"],
    ["documento", "Documento *"],
    ["fechaNacimiento", "Fecha de nacimiento"],
    ["telefono", "Teléfono"],
    ["correo", "Correo"],
  ];
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-sm" placeholder="Buscar por nombre, documento o teléfono" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <span className="text-sm text-text-2">
            {lista.length} pacientes · {datos.pacientes.filter((p) => p.proximaCita).length} con cita próxima
          </span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setNuevo({ tipoDocumento: "CC", epsId: datos.eps[0]?.id ?? "" })}>
            <Plus className="h-4 w-4" /> Nuevo paciente
          </Button>
        </div>
        {nuevo && (
          <div className="grid gap-3 rounded-md border bg-subtle p-3 sm:grid-cols-4">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={nuevo.tipoDocumento} onChange={(e) => setNuevo({ ...nuevo, tipoDocumento: e.target.value })} aria-label="Tipo de documento">
              {["CC", "TI", "CE", "RC", "PA"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            {campos.map(([k, l]) => (
              <Input key={k} type={k === "fechaNacimiento" ? "date" : "text"} placeholder={l} aria-label={l} value={nuevo[k] ?? ""} onChange={(e) => setNuevo({ ...nuevo, [k]: e.target.value })} />
            ))}
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={nuevo.epsId ?? ""} onChange={(e) => setNuevo({ ...nuevo, epsId: e.target.value })} aria-label="EPS">
              <option value="">Particular</option>
              {datos.eps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
            <div className="flex gap-2 sm:col-span-4">
              <Button
                size="sm"
                disabled={!nuevo.nombres?.trim() || !nuevo.documento?.trim()}
                onClick={() =>
                  void accion({
                    accion: "crearPaciente",
                    tipoDocumento: nuevo.tipoDocumento,
                    documento: nuevo.documento,
                    nombres: nuevo.nombres,
                    apellidos: nuevo.apellidos || undefined,
                    fechaNacimiento: nuevo.fechaNacimiento || undefined,
                    telefono: nuevo.telefono || undefined,
                    correo: nuevo.correo || undefined,
                    epsId: nuevo.epsId || null,
                  }).then((ok) => ok && setNuevo(null))
                }
              >
                Guardar paciente
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNuevo(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-text-3">
                <th className="py-1">Paciente</th>
                <th>Documento</th>
                <th>Edad</th>
                <th>Teléfono</th>
                <th>EPS</th>
                <th>Próxima cita</th>
                <th>Última atención</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-1.5">
                    {p.nombres} {p.apellidos}
                    {p.contactId && <span className="ml-1 rounded bg-emerald-500/10 px-1 text-[10px] text-emerald-700">WhatsApp</span>}
                  </td>
                  <td className="font-mono text-xs">
                    {p.tipoDocumento} {p.documento}
                  </td>
                  <td className="text-xs">{edad(p.fechaNacimiento)}</td>
                  <td className="font-mono text-xs">{p.telefono}</td>
                  <td className="text-xs">{p.epsId ? eps.get(p.epsId) : "Particular"}</td>
                  <td className="text-xs">{p.proximaCita ? fechaLarga(p.proximaCita) : <span className="text-text-3">Sin cita</span>}</td>
                  <td className="text-xs">{p.ultimaAtencion ? dia(p.ultimaAtencion) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Profesionales({ datos }: { datos: Datos }) {
  const esp = new Map(datos.especialidades.map((e) => [e.id, e]));
  const prof = new Map(datos.profesionales.map((p) => [p.id, p.nombre]));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {datos.procedimientos.length > 0 && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Exámenes y procedimientos</CardTitle>
            <CardDescription>
              Quién los realiza, cuánto duran y la preparación que recibe el paciente al agendar (con su guía en PDF).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border">
              {datos.procedimientos.map((x) => (
                <li key={x.id} className="space-y-1 px-3 py-2 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <strong>{x.nombre}</strong>
                    <span className="text-xs text-text-2">
                      {x.tipo === "procedimiento" ? "Procedimiento" : "Examen"} · {x.duracionMin} min · {esp.get(x.especialidadId)?.nombre}
                    </span>
                    {x.pdf && (
                      <a className="text-xs text-primary underline" href={`/clinica-docs/recomendaciones/${x.pdf}`} target="_blank" rel="noreferrer">
                        Guía de preparación (PDF)
                      </a>
                    )}
                  </p>
                  <p className="text-xs text-text-2">Lo realiza: {x.profesionalIds.map((id) => prof.get(id)).filter(Boolean).join(", ")}</p>
                  {x.recomendacion && <p className="text-xs">{x.recomendacion.split("\n").join(" · ")}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {datos.especialidades.map((e) => {
        const suyos = datos.profesionales.filter((p) => p.especialidadId === e.id);
        return (
          <Card key={e.id}>
            <CardHeader>
              <CardTitle className="text-base">{e.nombre}</CardTitle>
              <CardDescription>{esp.get(e.id)?.descripcion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {suyos.length === 0 && <p className="text-sm text-text-3">Sin profesionales.</p>}
              {suyos.map((p) => (
                <div key={p.id} className="rounded-md border px-3 py-2 text-sm">
                  <p className="font-medium">
                    {p.nombre} <span className="text-xs font-normal text-text-2">· {p.tipo === "optometra" ? "Optómetra" : p.tipo === "enfermeria" ? "Enfermería / técnico" : "Oftalmólogo(a)"} · {p.registro}</span>
                  </p>
                  <p className="text-xs text-text-2">
                    {Object.entries(p.horario)
                      .map(([d, ivs]) => `${DIAS[d] ?? d} ${ivs.map((i) => `${i.start}–${i.end}`).join(", ")}`)
                      .join(" · ")}{" "}
                    · citas de {p.duracionMin} min
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
