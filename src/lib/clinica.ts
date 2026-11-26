/**
 * Demo clínica oftalmológica — la parte PURA: horarios de los profesionales,
 * huecos libres por especialidad, tope mensual de los contratos y cómo se
 * reconoce la especialidad en lo que escribe el paciente. Sin BD ni reloj.
 */
import {
  dayIsoInTz,
  eachDateInRange,
  expandWorkingDayToUtc,
  labelInTz,
  overlaps,
  weekdayKeyOf,
  type Interval,
  type WeekdayKey,
} from "@/lib/time/slots";

export const ZONA_CLINICA = "America/Bogota";
export const AVISO_MINIMO_HORAS = 2;
/** Hasta dónde se buscan huecos: alcanza para ofrecer el mes siguiente si el tope de este ya se llenó. */
export const DIAS_HORIZONTE = 45;

export type Horario = Partial<Record<WeekdayKey, Interval[]>>;

export const ESTADOS_CITA = ["agendada", "atendida", "no_asistio", "cancelada"] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];
export const ETIQUETA_ESTADO: Record<EstadoCita, string> = {
  agendada: "Agendada",
  atendida: "Atendida",
  no_asistio: "No asistió",
  cancelada: "Cancelada",
};

export type ProfesionalAgenda = { id: string; horario: Horario; duracionMin: number };
export type Ocupada = { profesionalId: string; startUtc: string; endUtc: string };
export type HuecoClinica = { startUtc: string; endUtc: string; label: string; profesionalIds: string[] };

/** "YYYY-MM" del instante, en la hora de Colombia. */
export function mesDe(startUtc: string | Date): string {
  const d = typeof startUtc === "string" ? new Date(startUtc) : startUtc;
  return dayIsoInTz(d, ZONA_CLINICA).slice(0, 7);
}

/** ¿Cabe una cita de `valor` sin pasar el tope del mes? */
export function cabeEnTope(tope: number, consumido: number, valor: number): boolean {
  return consumido + valor <= tope;
}

/**
 * Los huecos libres de una especialidad: el horario de cada profesional,
 * menos sus citas, menos lo que ya pasó (con aviso mínimo), menos los meses en
 * que el contrato ya no tiene cupo para el valor del servicio. Un mismo
 * instante puede tener varios profesionales libres: van juntos.
 */
export function huecosLibres(input: {
  profesionales: ProfesionalAgenda[];
  ocupadas: Ocupada[];
  fromISO: string;
  toISO: string;
  now: Date;
  /** Sin tope (particular o contrato sin servicio): no se filtra por cupo. */
  tope?: { topeMensual: number; valor: number; consumoPorMes: Record<string, number> } | null;
}): HuecoClinica[] {
  const minMs = input.now.getTime() + AVISO_MINIMO_HORAS * 3_600_000;
  const porInicio = new Map<string, HuecoClinica>();
  for (const p of input.profesionales) {
    const suyas = input.ocupadas.filter((o) => o.profesionalId === p.id);
    for (const dia of eachDateInRange(input.fromISO, input.toISO)) {
      const wd = weekdayKeyOf(dia, ZONA_CLINICA);
      const intervalos = (wd && p.horario[wd]) || [];
      if (intervalos.length === 0) continue;
      for (const s of expandWorkingDayToUtc(dia, intervalos, ZONA_CLINICA, p.duracionMin, 0)) {
        if (Date.parse(s.startUtc) < minMs) continue;
        if (suyas.some((o) => overlaps(s.startUtc, s.endUtc, o.startUtc, o.endUtc))) continue;
        if (input.tope) {
          const consumido = input.tope.consumoPorMes[mesDe(s.startUtc)] ?? 0;
          if (!cabeEnTope(input.tope.topeMensual, consumido, input.tope.valor)) continue;
        }
        const ya = porInicio.get(s.startUtc);
        if (ya) ya.profesionalIds.push(p.id);
        else
          porInicio.set(s.startUtc, {
            startUtc: s.startUtc,
            endUtc: s.endUtc,
            label: labelInTz(s.startUtc, ZONA_CLINICA),
            profesionalIds: [p.id],
          });
      }
    }
  }
  return [...porInicio.values()].sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
}

export const sinTildes = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export type EspecialidadReconocible = { id: string; nombre: string; palabras: string | null };

/**
 * La especialidad que pide el paciente. Se miran los textos del más reciente
 * al más antiguo y gana el primero que nombre una; dentro de un texto, la que
 * más palabras suyas tenga. Sin ninguna, `null` (quien llama decide el defecto).
 */
export function reconocerEspecialidad(
  textosRecientesPrimero: string[],
  especialidades: EspecialidadReconocible[]
): string | null {
  for (const texto of textosRecientesPrimero) {
    const t = ` ${sinTildes(texto)} `;
    let mejor: { id: string; puntos: number } | null = null;
    for (const e of especialidades) {
      const claves = [e.nombre, ...(e.palabras ?? "").split(",")]
        .map((x) => sinTildes(x.trim()))
        .filter((x) => x.length >= 3);
      const puntos = claves.reduce((n, k) => n + (t.includes(k) ? k.length : 0), 0);
      if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { id: e.id, puntos };
    }
    if (mejor) return mejor.id;
  }
  return null;
}

/** Documento de identidad escrito en un texto (6 a 11 dígitos, con o sin puntos). */
export function documentoEnTexto(texto: string): string | null {
  const m = /(?:c\.?c\.?|cedula|c[ée]dula|documento|t\.?i\.?|tarjeta de identidad|identificaci[oó]n|n[uú]mero)?[^\d]{0,15}(\d{6,11}|\d{1,3}(?:[.\s]?\d{3}){1,3})/i.exec(
    texto
  );
  if (!m?.[1]) return null;
  const limpio = m[1].replace(/[.\s]/g, "");
  return limpio.length >= 6 && limpio.length <= 11 && !/^3\d{9}$/.test(limpio) ? limpio : null;
}

export function formatoPesosCO(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}

/** "martes 2 de diciembre, 9:00 a. m." en hora de Colombia. */
export function fechaLarga(startUtc: string | Date): string {
  const d = typeof startUtc === "string" ? new Date(startUtc) : startUtc;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: ZONA_CLINICA,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
