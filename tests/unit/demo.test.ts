import { describe, expect, it } from "vitest";
import { pideDemo } from "@/server/bot/demo";

describe("Syrtel — solicitud de demo en el handoff", () => {
  it("la detecta por el motivo", () => {
    expect(pideDemo("demo", null)).toBe(true);
    expect(pideDemo("Quiere una DEMO del CRM", {})).toBe(true);
  });
  it("la detecta por la ficha", () => {
    expect(pideDemo(undefined, { demo: "solicitada" })).toBe(true);
    expect(pideDemo("cliente", { demo: true })).toBe(true);
  });
  it("no la inventa", () => {
    expect(pideDemo("cliente", { demo: "no" })).toBe(false);
    expect(pideDemo(undefined, { demo: "" })).toBe(false);
    expect(pideDemo(undefined, { interes: "precios" })).toBe(false);
    expect(pideDemo(undefined, null)).toBe(false);
  });
});

describe("Syrtel — demo anotada en las notas", () => {
  it("la detecta cuando la IA la escribió en otra clave", () => {
    expect(pideDemo("modelo", { notas: "Contacto: José. Solicitó demo de 30 minutos." })).toBe(true);
    expect(pideDemo(undefined, { resumen: "Quiere una demo el jueves" })).toBe(true);
    expect(pideDemo(undefined, { notas: "No quiere demo por ahora" })).toBe(false);
    expect(pideDemo(undefined, { notas: "Preguntó por precios" })).toBe(false);
  });
});
