import { describe, expect, it } from "vitest";
import { cabeEnTope, documentoEnTexto, huecosLibres, mesDe, reconocerEspecialidad } from "@/lib/clinica";

const ESP = [
  { id: "gen", nombre: "Oftalmología general", palabras: "oftalmologo,ojo rojo,revision" },
  { id: "opt", nombre: "Optometría", palabras: "gafas,lentes,formula,examen de la vista" },
  { id: "ret", nombre: "Retina y vítreo", palabras: "retina,diabetes,macula" },
  { id: "glc", nombre: "Glaucoma", palabras: "glaucoma,presion ocular" },
];

describe("demo clínica — especialidad que pide el paciente", () => {
  it("la reconoce por sus palabras, del mensaje más reciente al más antiguo", () => {
    expect(reconocerEspecialidad(["Necesito cita para que me revisen la fórmula de las gafas"], ESP)).toBe("opt");
    expect(reconocerEspecialidad(["soy diabético y me mandaron a revisar la retina"], ESP)).toBe("ret");
    expect(reconocerEspecialidad(["mejor para glaucoma", "quería optometría"], ESP)).toBe("glc");
    expect(reconocerEspecialidad(["hola, buenos días"], ESP)).toBeNull();
  });
});

describe("demo clínica — tope mensual del contrato", () => {
  it("una cita cabe si no pasa el tope", () => {
    expect(cabeEnTope(5_000_000, 4_950_000, 45_000)).toBe(true);
    expect(cabeEnTope(5_000_000, 4_960_000, 45_000)).toBe(false);
  });

  it("los huecos saltan al mes siguiente cuando el mes ya llegó al tope", () => {
    const ahora = new Date("2026-11-26T13:00:00Z"); // jueves 26 nov, 8:00 a. m. en Bogotá
    const huecos = huecosLibres({
      profesionales: [{ id: "p1", horario: { mon: [{ start: "08:00", end: "09:00" }], thu: [{ start: "08:00", end: "09:00" }] }, duracionMin: 30 }],
      ocupadas: [],
      fromISO: "2026-11-26",
      toISO: "2026-12-10",
      now: ahora,
      tope: { topeMensual: 300_000, valor: 45_000, consumoPorMes: { "2026-11": 280_000 } },
    });
    expect(huecos.length).toBeGreaterThan(0);
    expect(huecos.every((h) => mesDe(h.startUtc) === "2026-12")).toBe(true);
  });

  it("no ofrece lo ocupado ni lo que empieza en menos de 2 horas", () => {
    const ahora = new Date("2026-11-30T12:00:00Z"); // lunes 7:00 a. m. en Bogotá
    const huecos = huecosLibres({
      profesionales: [{ id: "p1", horario: { mon: [{ start: "08:00", end: "11:00" }] }, duracionMin: 30 }],
      ocupadas: [{ profesionalId: "p1", startUtc: "2026-11-30T15:00:00.000Z", endUtc: "2026-11-30T15:30:00.000Z" }],
      fromISO: "2026-11-30",
      toISO: "2026-11-30",
      now: ahora,
    });
    const horas = huecos.map((h) => h.startUtc.slice(11, 16));
    expect(horas).not.toContain("13:00"); // 8:00, antes del aviso mínimo
    expect(horas).not.toContain("15:00"); // ocupado
    expect(horas).toContain("14:00");
  });

  it("varios profesionales libres a la misma hora van juntos", () => {
    const h = { tue: [{ start: "08:00", end: "08:30" }] };
    const huecos = huecosLibres({
      profesionales: [
        { id: "a", horario: h, duracionMin: 30 },
        { id: "b", horario: h, duracionMin: 30 },
      ],
      ocupadas: [],
      fromISO: "2026-12-01",
      toISO: "2026-12-01",
      now: new Date("2026-11-26T12:00:00Z"),
    });
    expect(huecos).toHaveLength(1);
    expect(huecos[0]!.profesionalIds).toEqual(["a", "b"]);
  });
});

describe("demo clínica — documento en el chat", () => {
  it("lee la cédula y no confunde un celular", () => {
    expect(documentoEnTexto("mi cédula es 1.043.567.812")).toBe("1043567812");
    expect(documentoEnTexto("CC 72145890")).toBe("72145890");
    expect(documentoEnTexto("mi celular 3001234567")).toBeNull();
  });
});
