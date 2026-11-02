/**
 * Petrominal — contenedor de página con su propio scroll. El marco de la app
 * tiene alto fijo (cada pantalla administra su desplazamiento): sin esto, una
 * página larga queda cortada y no se puede bajar.
 */
export function PaginaConScroll({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto p-4 sm:p-6">{children}</div>;
}
