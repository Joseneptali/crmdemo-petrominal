import { headers } from "next/headers";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  actual: z.string().min(1, "Escribe tu contraseña actual"),
  nueva: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres").max(128),
});

/** Petrominal — cada usuario cambia su propia contraseña (cierra sus otras sesiones). */
export const POST = withAuth(async (_session, req: Request) => {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  try {
    await getAuth().api.changePassword({
      body: { currentPassword: body.data.actual, newPassword: body.data.nueva, revokeOtherSessions: true },
      headers: await headers(),
    });
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/invalid|incorrect|password/i.test(msg)) {
      return apiError(422, "clave_actual", "La contraseña actual no es correcta");
    }
    return apiError(422, "invalid", "No se pudo cambiar la contraseña");
  }
});
