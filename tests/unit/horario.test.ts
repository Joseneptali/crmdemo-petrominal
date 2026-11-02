import { describe, expect, it } from "vitest";
import { dentroDeHorario, describirHorario, HORARIO_POR_DEFECTO } from "@/lib/horario";

describe("horario de atención (hora de Colombia)", () => {
  it("abre entre semana y cierra de noche y el domingo", () => {
    // Lunes 3 nov 2026 10:00 en Bogotá = 15:00 UTC
    expect(dentroDeHorario(HORARIO_POR_DEFECTO, new Date("2026-11-02T15:00:00Z"))).toBe(true);
    // Lunes 22:00 en Bogotá = martes 03:00 UTC
    expect(dentroDeHorario(HORARIO_POR_DEFECTO, new Date("2026-11-03T03:00:00Z"))).toBe(false);
    // Sábado 13:00 en Bogotá (cierra a las 12)
    expect(dentroDeHorario(HORARIO_POR_DEFECTO, new Date("2026-11-07T18:00:00Z"))).toBe(false);
    // Domingo
    expect(dentroDeHorario(HORARIO_POR_DEFECTO, new Date("2026-11-08T15:00:00Z"))).toBe(false);
  });

  it("describe el horario agrupando días seguidos", () => {
    expect(describirHorario(HORARIO_POR_DEFECTO)).toBe("lunes a viernes 08:00–17:30; sábado 08:00–12:00");
  });
});

describe("un aviso por cierre", () => {
  it("no repite mientras siga cerrado y vuelve a avisar tras abrir", async () => {
    const { huboApertura } = await import("@/lib/horario");
    // Lunes 22:00 → martes 02:00 (Bogotá): sigue cerrado.
    expect(huboApertura(HORARIO_POR_DEFECTO, new Date("2026-11-03T03:00:00Z"), new Date("2026-11-03T07:00:00Z"))).toBe(false);
    // Lunes 22:00 → martes 22:00: abrió el martes.
    expect(huboApertura(HORARIO_POR_DEFECTO, new Date("2026-11-03T03:00:00Z"), new Date("2026-11-04T03:00:00Z"))).toBe(true);
  });
});
