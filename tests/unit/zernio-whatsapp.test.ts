import { describe, expect, it } from "vitest";
import {
  esEventoWhatsapp,
  normalizeZernioWhatsappEvent,
  telefonoDelRemitente,
} from "@/server/zernio-whatsapp/ingest";

/** Entrega real de Zernio (WhatsApp), con datos anonimizados. */
const entrega = {
  id: "a864e730-0000-0000-0000-000000000000",
  event: "message.received",
  message: {
    id: "6ae7f4d470b297d220403a3e",
    conversationId: "6ae7f4d470b297d220403a3d",
    platform: "whatsapp",
    platformMessageId: "wamid.XXX",
    direction: "incoming",
    text: "Hola",
    attachments: [],
    sender: {
      id: "573000000000",
      name: "Cliente de prueba",
      phoneNumber: "+573000000000",
      businessScopedUserId: "CO.1234567890",
    },
    sentAt: "2026-11-02T02:26:25.000Z",
  },
  conversation: { id: "6ae7f4d470b297d220403a3d" },
  account: {
    id: "6ae7ee5c8f94614cd2ade492",
    platform: "whatsapp",
    accountId: "6ae7ee5c8f94614cd2ade492",
  },
};

describe("WhatsApp por Zernio", () => {
  it("reconoce la entrega como de WhatsApp", () => {
    expect(esEventoWhatsapp(entrega)).toBe(true);
    expect(esEventoWhatsapp({ ...entrega, account: { ...entrega.account, platform: "instagram" }, message: { ...entrega.message, platform: "instagram" } })).toBe(false);
  });

  it("normaliza el mensaje con teléfono, BSUID, hilo y hora del evento", () => {
    const [m] = normalizeZernioWhatsappEvent(entrega);
    expect(m).toMatchObject({
      accountRef: "6ae7ee5c8f94614cd2ade492",
      phone: "573000000000",
      waUserId: "CO.1234567890",
      messageId: "6ae7f4d470b297d220403a3e",
      text: "Hola",
      type: "text",
      threadRef: "6ae7f4d470b297d220403a3d",
      timestamp: String(Date.parse("2026-11-02T02:26:25.000Z") / 1000),
    });
  });

  it("descarta lo saliente y los eventos que no son mensajes", () => {
    expect(normalizeZernioWhatsappEvent({ ...entrega, message: { ...entrega.message, direction: "outgoing" } })).toEqual([]);
    expect(normalizeZernioWhatsappEvent({ ...entrega, event: "webhook.test" })).toEqual([]);
  });

  it("solo toma como teléfono un id que lo es", () => {
    expect(telefonoDelRemitente("+57 300 000 0000")).toBe("573000000000");
    expect(telefonoDelRemitente("6ae7f4d470b297d220403a40")).toBeNull();
  });
});
