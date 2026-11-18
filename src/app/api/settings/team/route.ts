import { eq, inArray } from "drizzle-orm";
import { publish } from "@/server/events/bus";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const members = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, session.organizationId));
  return Response.json({
    puedeGestionar: session.role === "owner",
    yo: session.userId,
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      name: m.name,
      email: m.email,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  /** Petrominal: `member` = asesor (ve su cartera); `admin` = administración. */
  role: z.enum(["member", "admin"]).optional(),
});

/** Alta de cuenta de equipo (owner only): email + contraseña temporal (FR-061). */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede crear cuentas");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const auth = getAuth();
  let newUserId: string;
  try {
    const result = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: body.data.name,
          email: body.data.email,
          password: body.data.password,
        },
      })
    );
    newUserId = result.user.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la cuenta";
    if (/exist/i.test(message)) {
      return apiError(409, "duplicate", "Ya existe una cuenta con ese correo");
    }
    return apiError(422, "invalid", message);
  }

  const db = getDb();
  await db
    .insert(schema.member)
    .values({
      id: newId("member"),
      organizationId: session.organizationId,
      userId: newUserId,
      role: body.data.role ?? "member",
    })
    .onConflictDoNothing();

  return Response.json({ ok: true }, { status: 201 });
});

const patchSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["member", "admin"]),
});

/** Petrominal — cambiar el rol (asesor ↔ administrador). Solo el propietario; el propietario no cambia. */
export const PATCH = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario cambia los roles");
  }
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const db = getDb();
  const [m] = await db
    .select({ id: schema.member.id, role: schema.member.role })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, session.organizationId, eq(schema.member.id, body.data.memberId)))
    .limit(1);
  if (!m) return apiError(404, "not_found", "Miembro no encontrado");
  if (m.role === "owner") return apiError(422, "owner", "El rol del propietario no se cambia");
  await db.update(schema.member).set({ role: body.data.role }).where(eq(schema.member.id, m.id));
  return Response.json({ ok: true });
});

const deleteSchema = z.object({
  memberId: z.string().min(1),
  /** A quién pasan sus clientes; vacío = quedan sin asesor (los atiende la administración). */
  reasignarA: z.string().min(1).nullable().optional(),
});

/**
 * Syrtel — eliminar un usuario del equipo SIN borrar datos (solo el
 * propietario; ni el propietario ni uno mismo).
 *
 * Se va: su membresía, sus sesiones abiertas y su acceso con contraseña, así
 * que no vuelve a entrar. Se queda todo lo demás: conversaciones, notas,
 * cotizaciones, reuniones e informes siguen mostrando su nombre. Sus clientes
 * pasan a otra persona del equipo o quedan sin asesor. Su correo se libera
 * para poder crear otra cuenta con él.
 */
export const DELETE = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario elimina usuarios");
  }
  const body = await parseBody(req, deleteSchema);
  if (!body.ok) return body.response;
  const db = getDb();
  const [m] = await db
    .select({ id: schema.member.id, role: schema.member.role, userId: schema.member.userId })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, session.organizationId, eq(schema.member.id, body.data.memberId)))
    .limit(1);
  if (!m) return apiError(404, "not_found", "Miembro no encontrado");
  if (m.role === "owner") return apiError(422, "owner", "El propietario no se puede eliminar");
  if (m.userId === session.userId) return apiError(422, "self", "No puede eliminar su propio usuario");

  let destino: string | null = null;
  if (body.data.reasignarA) {
    const [d] = await db
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(scoped(schema.member.organizationId, session.organizationId, eq(schema.member.userId, body.data.reasignarA)))
      .limit(1);
    if (!d || d.userId === m.userId) {
      return apiError(422, "reasignar", "Elija a otra persona del equipo para sus clientes");
    }
    destino = d.userId;
  }

  const [u] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, m.userId)).limit(1);

  const clientes = await db.transaction(async (tx) => {
    const movidos = await tx
      .update(schema.contact)
      .set({ asesorUserId: destino, updatedAt: new Date() })
      .where(scoped(schema.contact.organizationId, session.organizationId, eq(schema.contact.asesorUserId, m.userId)))
      .returning({ id: schema.contact.id });
    await tx
      .update(schema.petrominalAjustes)
      .set({ adminPrincipalUserId: null, updatedAt: new Date() })
      .where(
        scoped(
          schema.petrominalAjustes.organizationId,
          session.organizationId,
          eq(schema.petrominalAjustes.adminPrincipalUserId, m.userId)
        )
      );
    await tx.delete(schema.member).where(eq(schema.member.id, m.id));
    await tx.delete(schema.session).where(eq(schema.session.userId, m.userId));
    await tx.delete(schema.account).where(eq(schema.account.userId, m.userId));
    if (u) {
      await tx
        .update(schema.user)
        .set({ email: `eliminado-${Date.now()}.${u.email}`, updatedAt: new Date() })
        .where(eq(schema.user.id, m.userId));
    }
    return movidos.map((c) => c.id);
  });

  // Las bandejas abiertas recargan: los chats de sus clientes cambian de dueño.
  if (clientes.length > 0) {
    const convs = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(scoped(schema.conversation.organizationId, session.organizationId, inArray(schema.conversation.contactId, clientes)));
    for (const c of convs) {
      publish(session.organizationId, { type: "conversation.updated", data: { conversation: { id: c.id } } });
    }
  }
  return Response.json({ ok: true, clientes: clientes.length });
});
