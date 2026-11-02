/** Petrominal — el periodo de un informe desde la URL (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD, hora de Colombia). */
export function rangoDe(url: URL): { desde: Date; hasta: Date } {
  const valida = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const hasta = valida(url.searchParams.get("hasta")) ?? hoy;
  const porDefecto = new Date(Date.parse(`${hoy}T00:00:00-05:00`) - 29 * 86_400_000);
  const desde = valida(url.searchParams.get("desde"));
  return {
    desde: desde ? new Date(`${desde}T00:00:00-05:00`) : porDefecto,
    // Hasta el final del día pedido.
    hasta: new Date(Date.parse(`${hasta}T00:00:00-05:00`) + 86_400_000),
  };
}
