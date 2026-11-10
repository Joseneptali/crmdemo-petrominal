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
