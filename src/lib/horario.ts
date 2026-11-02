/**
 * Petrominal — horario de atención. Puro (sin servidor) para probarlo y usarlo
 * en la UI. La hora se lee en la zona del negocio (Colombia).
 */

export type Horario = Record<string, [string, string]>;

export const ZONA = "America/Bogota";

export const DIAS = [
  ["1", "Lunes"],
  ["2", "Martes"],
  ["3", "Miércoles"],
  ["4", "Jueves"],
  ["5", "Viernes"],
  ["6", "Sábado"],
  ["7", "Domingo"],
] as const;

export const HORARIO_POR_DEFECTO: Horario = {
  "1": ["08:00", "17:30"],
  "2": ["08:00", "17:30"],
  "3": ["08:00", "17:30"],
  "4": ["08:00", "17:30"],
  "5": ["08:00", "17:30"],
  "6": ["08:00", "12:00"],
};

export const MENSAJE_POR_DEFECTO =
  "¡Gracias por escribir a Petrominal S.A.S.! En este momento estamos fuera de nuestro horario de atención ({horario}). Un asesor le responderá apenas estemos disponibles.";

/** Día (1-7, lunes = 1) y minutos del día en la zona del negocio. */
export function ahoraEnZona(fecha: Date, zona = ZONA): { dia: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const dias: Record<string, string> = { Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6", Sun: "7" };
  return { dia: dias[get("weekday")] ?? "1", minutos: Number(get("hour")) * 60 + Number(get("minute")) };
}

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function dentroDeHorario(horario: Horario, fecha: Date, zona = ZONA): boolean {
  const { dia, minutos } = ahoraEnZona(fecha, zona);
  const tramo = horario[dia];
  if (!tramo) return false;
  return minutos >= aMinutos(tramo[0]) && minutos < aMinutos(tramo[1]);
}

/** «lunes a viernes 08:00–17:30; sábado 08:00–12:00». */
export function describirHorario(horario: Horario): string {
  const grupos: { desde: number; hasta: number; tramo: string }[] = [];
  DIAS.forEach(([clave], i) => {
    const t = horario[clave];
    if (!t) return;
    const tramo = `${t[0]}–${t[1]}`;
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.tramo === tramo && ultimo.hasta === i - 1) ultimo.hasta = i;
    else grupos.push({ desde: i, hasta: i, tramo });
  });
  const nombre = (i: number) => DIAS[i]![1].toLowerCase();
  return grupos
    .map((g) => `${g.desde === g.hasta ? nombre(g.desde) : `${nombre(g.desde)} a ${nombre(g.hasta)}`} ${g.tramo}`)
    .join("; ");
}
