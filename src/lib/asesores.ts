import { canConfigure } from "@/lib/auth/roles";

/**
 * Petrominal — contrato de asesores comerciales, compartido por la API y la UI.
 *
 * Quien configura (propietario o administrador) ve toda la operación y asigna
 * clientes; un asesor (`member`) ve solo su cartera.
 */

export type MiembroDto = {
  userId: string;
  nombre: string;
  email: string;
  rol: string;
};

export type EquipoDto = {
  miembros: MiembroDto[];
  /** Quién recibe los clientes nuevos o sin asesor. */
  adminPrincipal: MiembroDto | null;
  /** ¿Quien mira puede asignar? */
  puedeAsignar: boolean;
};

/** ¿Este rol ve toda la operación? (si no, solo su cartera). */
export function veTodo(role: string | null | undefined): boolean {
  return canConfigure(role);
}
