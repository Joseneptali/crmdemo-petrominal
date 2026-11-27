/**
 * Qué negocio atiende la IA del CRM demo. Por defecto Petrominal (asistente
 * comercial de izaje). Con `IA_MODO=syrtel`, la IA vende Syrtel CRM: ficha de
 * prospecto, cotización de prueba y demos asignadas al administrador.
 */
export function modoSyrtel(): boolean {
  return (process.env.IA_MODO ?? "").trim().toLowerCase() === "syrtel";
}
