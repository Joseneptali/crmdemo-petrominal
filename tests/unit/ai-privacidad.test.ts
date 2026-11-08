import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aplicaPrivacidad,
  conPrivacidad,
  preferenciasPara,
  PREFERENCIAS_PRIVADAS,
} from "@/lib/ai/privacidad";
import { clasificarFallo } from "@/lib/ai/probe";

/**
 * Lo que se protege: con OpenRouter, toda petición pide endpoints sin
 * retención (`zdr`) y sin entrenamiento (`data_collection: "deny"`); con otro
 * proveedor el cuerpo no se toca; y `OPENROUTER_PRIVACIDAD=off` lo apaga.
 */

const OR = "https://openrouter.ai/api";
const OTRO = "https://api.z.ai/api/paas/v4";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("aplicaPrivacidad", () => {
  it("encendida por defecto con OpenRouter, con o sin /v1 y barra final", () => {
    expect(aplicaPrivacidad(OR)).toBe(true);
    expect(aplicaPrivacidad("https://openrouter.ai/api/v1")).toBe(true);
    expect(aplicaPrivacidad("https://openrouter.ai/api/")).toBe(true);
  });

  it("no aplica a otros proveedores compatibles con OpenAI", () => {
    expect(aplicaPrivacidad(OTRO)).toBe(false);
    expect(aplicaPrivacidad("https://api.openai.com/v1")).toBe(false);
  });

  it("OPENROUTER_PRIVACIDAD=off (o false, 0) la apaga; cualquier otro valor la deja", () => {
    for (const v of ["off", "OFF", "false", "0", " off "]) {
      vi.stubEnv("OPENROUTER_PRIVACIDAD", v);
      expect(aplicaPrivacidad(OR)).toBe(false);
    }
    for (const v of ["on", "", "si"]) {
      vi.stubEnv("OPENROUTER_PRIVACIDAD", v);
      expect(aplicaPrivacidad(OR)).toBe(true);
    }
  });
});

describe("preferenciasPara", () => {
  it("devuelve las preferencias con OpenRouter y undefined con otro (JSON.stringify las omite)", () => {
    expect(preferenciasPara(OR)).toEqual({ zdr: true, data_collection: "deny" });
    expect(preferenciasPara(OTRO)).toBeUndefined();
    expect(JSON.stringify({ model: "m", provider: preferenciasPara(OTRO) })).toBe('{"model":"m"}');
  });
});

describe("conPrivacidad (proxy del cerebro)", () => {
  const CUERPO = JSON.stringify({ model: "z-ai/glm-5.3-flash", messages: [{ role: "user", content: "hola" }], extra: { x: 1 } });

  it("con OpenRouter agrega provider.zdr y provider.data_collection y conserva todo lo demás", () => {
    const salida = JSON.parse(conPrivacidad(CUERPO, OR));
    expect(salida).toEqual({ ...JSON.parse(CUERPO), provider: PREFERENCIAS_PRIVADAS });
  });

  it("respeta el provider que mande el cerebro, pero fuerza las dos llaves de privacidad", () => {
    const cuerpo = JSON.stringify({
      model: "m",
      messages: [],
      provider: { order: ["deepinfra"], zdr: false, data_collection: "allow" },
    });
    expect(JSON.parse(conPrivacidad(cuerpo, OR)).provider).toEqual({
      order: ["deepinfra"],
      zdr: true,
      data_collection: "deny",
    });
  });

  it("con otro proveedor o con la privacidad apagada, el cuerpo sale idéntico", () => {
    expect(conPrivacidad(CUERPO, OTRO)).toBe(CUERPO);
    vi.stubEnv("OPENROUTER_PRIVACIDAD", "off");
    expect(conPrivacidad(CUERPO, OR)).toBe(CUERPO);
  });

  it("un cuerpo que no es un objeto JSON se reenvía sin cambios", () => {
    for (const raro of ["no es json", "[1,2]", "null", "42", ""]) {
      expect(conPrivacidad(raro, OR)).toBe(raro);
    }
  });

  it("un provider que no es objeto se reemplaza por las preferencias", () => {
    const cuerpo = JSON.stringify({ model: "m", provider: "cualquiera" });
    expect(JSON.parse(conPrivacidad(cuerpo, OR)).provider).toEqual(PREFERENCIAS_PRIVADAS);
  });
});

describe("Probar conexión — el 404 de política de datos", () => {
  it("se explica como privacidad, no como modelo desconocido", () => {
    const r = clasificarFallo(404, '{"error":{"message":"No endpoints found matching your data policy (Zero data retention)"}}');
    expect(r.code).toBe("provider_error");
    expect(r.message).toMatch(/privacidad/);
    expect(r.message).toMatch(/OPENROUTER_PRIVACIDAD=off/);
  });

  it("un 404 de modelo de verdad sigue siendo model_not_found", () => {
    expect(clasificarFallo(404, '{"error":{"message":"model not found"}}').code).toBe("model_not_found");
  });
});
