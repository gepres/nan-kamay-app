import type { RouteGuide } from '@presentation/stores/trackingStore';

/**
 * Puente entre el Planificador y la pre-grabación: el planificador deja aquí la
 * guía (puntos dibujados) y la pre-grabación la consume al abrirse con
 * `?planned=1`. Estado a nivel de módulo (igual que `waypointSelection`) para no
 * pasar arrays grandes por params de navegación.
 */
let pending: RouteGuide | null = null;

export function setPlannedGuide(guide: RouteGuide): void {
  pending = guide;
}

export function consumePlannedGuide(): RouteGuide | null {
  const g = pending;
  pending = null;
  return g;
}
