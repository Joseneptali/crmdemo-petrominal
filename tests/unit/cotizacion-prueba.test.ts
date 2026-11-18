import { describe, expect, it } from "vitest";
import { nichoDe, pidePrueba, plantillaPrueba, totalesPrueba, yaSalio } from "@/lib/cotizacion-prueba";
import { generarPdfPrueba } from "@/server/cotizacion-prueba/pdf";

describe("Syrtel — cotización de prueba", () => {
  it("elige la plantilla por el nicho que anotó la IA", () => {
    expect(nichoDe("Clínica odontológica")).toBe("salud");
    expect(nichoDe("colegio bilingüe")).toBe("educacion");
    expect(nichoDe("firma de contadores, cartera vencida")).toBe("contable");
    expect(nichoDe("inmobiliaria")).toBe("servicios");
    expect(nichoDe("ferretería")).toBe("comercio");
    expect(nichoDe(undefined)).toBe("comercio");
  });

  it("suma con IVA del 19 %", () => {
    const t = totalesPrueba([{ referencia: "A", descripcion: "x", cantidad: 2, unidad: "UND", precio: 100000 }]);
    expect(t).toEqual({ subtotal: 200000, iva: 38000, total: 238000 });
  });

  it("sale una sola vez", () => {
    expect(pidePrueba("solicitada")).toBe(true);
    expect(pidePrueba(true)).toBe(true);
    expect(pidePrueba("no")).toBe(false);
    expect(pidePrueba("enviada por WhatsApp")).toBe(false);
    expect(yaSalio("enviando")).toBe(true);
    expect(yaSalio("Enviada por correo")).toBe(true);
    expect(yaSalio("solicitada")).toBe(false);
  });

  it("genera un PDF válido para cada nicho", async () => {
    for (const n of ["salud", "educacion", "contable", "servicios", "comercio"] as const) {
      const pdf = await generarPdfPrueba({
        numero: "EJ-TEST",
        fecha: new Date("2026-11-17T15:00:00Z"),
        cliente: { nombre: "José Pérez", empresa: "Clínica Sonrisas", correo: "jose@ejemplo.com" },
        plantilla: plantillaPrueba(n),
      });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.byteLength).toBeGreaterThan(2000);
    }
  });
});

describe("Syrtel — la IA promete la cotización de ejemplo", () => {
  it("dispara cuando la promesa es firme", async () => {
    const { prometeCotizacionPrueba } = await import("@/lib/cotizacion-prueba");
    expect(
      prometeCotizacionPrueba("¡Listo, José! 😊 Su cotización de ejemplo ya va en camino — le llega por WhatsApp en unos segundos y al correo x@y.com.")
    ).toBe(true);
    expect(prometeCotizacionPrueba("Aquí le va la cotización de muestra de su clínica.")).toBe(true);
  });
  it("no dispara mientras la ofrece o pide datos", async () => {
    const { prometeCotizacionPrueba } = await import("@/lib/cotizacion-prueba");
    expect(
      prometeCotizacionPrueba("¡Perfecto! Le envío ahora mismo una cotización de ejemplo de su clínica por este chat y a su correo. ¿Me confirma su nombre y su correo?")
    ).toBe(false);
    expect(prometeCotizacionPrueba("¿Le gustaría ver cómo se vería una cita de su clínica?")).toBe(false);
  });
});
