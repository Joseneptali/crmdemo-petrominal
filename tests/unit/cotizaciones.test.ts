import { describe, expect, it } from "vitest";
import { aCentavos, aMilesimas, numeroCotizacion, totales, totalRenglonCents } from "@/lib/cotizaciones";
import { bloqueosDeEnvio, CLAVES, correoEnTexto, deFicha } from "@/server/cotizaciones";
import type { CotizacionDto } from "@/lib/cotizaciones";

describe("cotizador Petrominal", () => {
  it("calcula renglones con cantidades decimales y el IVA", () => {
    // 2,5 metros a $12.000,50
    expect(totalRenglonCents(aMilesimas(2.5), aCentavos(12000.5))).toBe(3_000_125);
    const t = totales(
      [
        { cantidadMilesimas: 2000, precioUnitarioCents: aCentavos(150000) },
        { cantidadMilesimas: 1000, precioUnitarioCents: aCentavos(50000) },
      ],
      19
    );
    expect(t).toEqual({
      subtotalCents: 35_000_000,
      descuentoCents: 0,
      baseCents: 35_000_000,
      ivaCents: 6_650_000,
      totalCents: 41_650_000,
    });
  });

  it("liquida el IVA sobre la base con descuento y lo exime en zona franca", () => {
    // La cotización JT-8204-26: 2 × $325.000, IVA 19 %.
    const items = [{ cantidadMilesimas: 2000, precioUnitarioCents: aCentavos(325000) }];
    expect(totales(items, 19).totalCents).toBe(aCentavos(773500));
    const conDcto = totales(items, 19, 10);
    expect(conDcto.descuentoCents).toBe(aCentavos(65000));
    expect(conDcto.baseCents).toBe(aCentavos(585000));
    expect(conDcto.ivaCents).toBe(aCentavos(111150));
    const franca = totales(items, 19, 0, true);
    expect(franca.ivaCents).toBe(0);
    expect(franca.totalCents).toBe(aCentavos(650000));
  });

  it("numera con ceros a la izquierda", () => {
    expect(numeroCotizacion(7)).toBe("COT-0007");
  });

  it("lee la ficha con distintos nombres de clave", () => {
    const ficha = { "Correo electrónico": "a@b.co", Empresa: "Acme", NIT: 900123 };
    expect(deFicha(ficha, ["correo", "correo_electronico"])).toBe("a@b.co");
    expect(deFicha(ficha, ["empresa"])).toBe("Acme");
    expect(deFicha(ficha, ["nit"])).toBe("900123");
    expect(deFicha(null, ["nit"])).toBeNull();
  });

  it("no deja enviar sin productos, sin precio o sin foto", () => {
    const base = { items: [], faltanFotos: [] } as unknown as CotizacionDto;
    expect(bloqueosDeEnvio(base)).toMatch(/no tiene productos/);
    const item = { referencia: "11-3-60", precioUnitario: 0 };
    expect(bloqueosDeEnvio({ ...base, items: [item] } as unknown as CotizacionDto)).toMatch(/precio/);
    expect(
      bloqueosDeEnvio({ ...base, items: [{ ...item, precioUnitario: 10 }], faltanFotos: ["11-3-60"] } as unknown as CotizacionDto)
    ).toMatch(/faltan fotos/);
    expect(bloqueosDeEnvio({ ...base, items: [{ ...item, precioUnitario: 10 }] } as unknown as CotizacionDto)).toBeNull();
  });
});

describe("correo del cliente en la ficha", () => {
  it("usa la clave «correo» cuando existe", () => {
    expect(deFicha({ correo: "a@b.co", notas: "x c@d.co" }, CLAVES.correo)).toBe("a@b.co");
  });
  it("rescata el correo escrito dentro de las notas", () => {
    expect(
      deFicha({ notas: "Contacto: Jose, correo Ing.Jose@Gmail.com. Pidió asesor." }, CLAVES.correo)
    ).toBe("ing.jose@gmail.com");
  });
  it("sin correo en ninguna parte devuelve null", () => {
    expect(deFicha({ notas: "sin datos" }, CLAVES.correo)).toBeNull();
    expect(correoEnTexto([1, null, "nada"])).toBeNull();
  });
});
