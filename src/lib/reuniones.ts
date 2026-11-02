/** Petrominal — contrato de reuniones, compartido por la API y la UI. */

export type ReunionDto = {
  id: string;
  titulo: string;
  inicio: string;
  duracionMin: number;
  lugar: string | null;
  notas: string | null;
  estado: "programada" | "realizada" | "cancelada";
  contacto: { id: string; nombre: string; telefono: string | null };
  correoCliente: string | null;
  asesor: { userId: string; nombre: string } | null;
  invitacion: Record<string, unknown> | null;
  recordatorios: Record<string, string> | null;
};

/** Cuándo salen los recordatorios, antes del inicio. */
export const RECORDATORIOS = [
  { clave: "24h", antesMs: 24 * 60 * 60 * 1000, etiqueta: "mañana" },
  { clave: "1h", antesMs: 60 * 60 * 1000, etiqueta: "en una hora" },
] as const;

export function fechaReunion(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

/** Evento iCalendar (invitación que Outlook, Gmail y Yahoo agregan al calendario). */
export function eventoIcs(r: {
  id: string;
  titulo: string;
  inicio: Date;
  duracionMin: number;
  lugar: string | null;
  descripcion: string;
  organizador: { nombre: string; correo: string };
  invitado: { nombre: string; correo: string } | null;
  cancelar?: boolean;
}): string {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fin = new Date(r.inicio.getTime() + r.duracionMin * 60_000);
  const lineas = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Petrominal SAS//CRM//ES",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${r.cancelar ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${r.id}@crm.petrominal`,
    `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(r.inicio)}`,
    `DTEND:${f(fin)}`,
    `SUMMARY:${esc(r.titulo)}`,
    `DESCRIPTION:${esc(r.descripcion)}`,
    ...(r.lugar ? [`LOCATION:${esc(r.lugar)}`] : []),
    `ORGANIZER;CN=${esc(r.organizador.nombre)}:mailto:${r.organizador.correo}`,
    ...(r.invitado
      ? [`ATTENDEE;CN=${esc(r.invitado.nombre)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${r.invitado.correo}`]
      : []),
    `STATUS:${r.cancelar ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(r.titulo)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lineas.join("\r\n");
}
