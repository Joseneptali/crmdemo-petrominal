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
