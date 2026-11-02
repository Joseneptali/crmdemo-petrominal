import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { columnasDelSecreto, secretoDeLaFila } from "@/server/zernio/secreto-guardado";

/**
 * Petrominal — credenciales de WhatsApp por Zernio.
 *
 * La llave viaja descifrada solo en memoria y nunca sale en una respuesta de
 * la API: hacia fuera se expone su cola.
 */

export type ZernioWhatsappCredentials = {
  id: string;
  organizationId: string;
  accountRef: string;
  displayName: string | null;
  webhookSecret: string | null;
  status: "connected" | "reconnect_required";
  token: string;
};

type Row = typeof schema.zernioWhatsappCredentials.$inferSelect;

function toCredentials(row: Row): ZernioWhatsappCredentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    accountRef: row.accountRef,
    displayName: row.displayName,
    webhookSecret: secretoDeLaFila(row),
    status: row.status,
    token: decryptSecret({ cipher: row.tokenCipher, iv: row.tokenIv, tag: row.tokenTag }),
  };
}

export async function getZernioWhatsappByOrg(
  organizationId: string
): Promise<ZernioWhatsappCredentials | null> {
  const rows = await getDb()
    .select()
    .from(schema.zernioWhatsappCredentials)
    .where(eq(schema.zernioWhatsappCredentials.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/** Enrutado del webhook de Zernio: el evento trae `account.id`. */
export async function getZernioWhatsappByAccountRef(
  accountRef: string
): Promise<ZernioWhatsappCredentials | null> {
  const rows = await getDb()
    .select()
    .from(schema.zernioWhatsappCredentials)
    .where(eq(schema.zernioWhatsappCredentials.accountRef, accountRef))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

export async function saveZernioWhatsapp(input: {
  organizationId: string;
  accountRef: string;
  displayName: string | null;
  token: string;
  webhookSecret: string | null;
}): Promise<void> {
  const db = getDb();
  const enc = encryptSecret(input.token);
  const existing = await getZernioWhatsappByOrg(input.organizationId);
  const values = {
    organizationId: input.organizationId,
    accountRef: input.accountRef,
    displayName: input.displayName,
    tokenCipher: enc.cipher,
    tokenIv: enc.iv,
    tokenTag: enc.tag,
    ...columnasDelSecreto(input.webhookSecret),
    status: "connected" as const,
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(schema.zernioWhatsappCredentials)
      .set(values)
      .where(eq(schema.zernioWhatsappCredentials.id, existing.id));
    return;
  }
  await db
    .insert(schema.zernioWhatsappCredentials)
    .values({ id: newId("credentials"), ...values });
}

export async function deleteZernioWhatsapp(organizationId: string): Promise<void> {
  await getDb()
    .delete(schema.zernioWhatsappCredentials)
    .where(eq(schema.zernioWhatsappCredentials.organizationId, organizationId));
}

/** La llave murió: se pausan los envíos y Ajustes pide reconectar. */
export async function markZernioWhatsappReconnectRequired(
  organizationId: string
): Promise<void> {
  await getDb()
    .update(schema.zernioWhatsappCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(eq(schema.zernioWhatsappCredentials.organizationId, organizationId));
}
