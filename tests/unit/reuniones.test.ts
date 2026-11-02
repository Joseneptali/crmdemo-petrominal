import { describe, expect, it } from "vitest";
import { eventoIcs } from "@/lib/reuniones";

describe("invitación de reunión (iCalendar)", () => {
  it("arma un evento con organizador, invitado y alarma", () => {
    const ics = eventoIcs({
      id: "reu_1",
      titulo: "Reunión, comercial",
      inicio: new Date("2026-11-05T15:00:00Z"),
      duracionMin: 45,
      lugar: "Oficina",
      descripcion: "Línea 1\nLínea 2",
      organizador: { nombre: "Asesor", correo: "a@petrominal.com" },
      invitado: { nombre: "Cliente", correo: "c@cliente.co" },
    });
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("DTSTART:20261105T150000Z");
    expect(ics).toContain("DTEND:20261105T154500Z");
    expect(ics).toContain("SUMMARY:Reunión\\, comercial");
    expect(ics).toContain("DESCRIPTION:Línea 1\\nLínea 2");
    expect(ics).toContain("mailto:c@cliente.co");
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
  });

  it("una cancelación lleva METHOD:CANCEL", () => {
    const ics = eventoIcs({
      id: "reu_1",
      titulo: "x",
      inicio: new Date(),
      duracionMin: 30,
      lugar: null,
      descripcion: "",
      organizador: { nombre: "A", correo: "a@a.co" },
      invitado: null,
      cancelar: true,
    });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
  });
});
