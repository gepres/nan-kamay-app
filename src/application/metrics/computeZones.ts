import { fastDistanceMeters } from '@shared/utils/geometry';

/**
 * Agrupación geográfica para la vista Lugares/Zonas — funciones PURAS.
 * Offline: no hay reverse-geocoding, así que las zonas se etiquetan con el
 * nombre de su ruta más larga (nombre dado por el usuario, significativo).
 */

export interface RouteAnchor {
  routeId: string;
  name: string;
  distanceMeters: number;
  activityType?: string;
  lat: number;
  lon: number;
}

export interface WaypointLite {
  title: string;
  type?: string;
  lat: number;
  lon: number;
}

export interface Zone {
  id: number;
  label: string;
  count: number;
  distanceMeters: number;
  /** Fracción 0..1 respecto a la zona más frecuente (para la barra). */
  fraction: number;
  lat: number;
  lon: number;
}

export interface Place {
  title: string;
  type?: string;
  count: number;
}

/** Agrupa rutas por proximidad de su ancla (clustering voraz por radio). */
export function computeZones(anchors: RouteAnchor[], radiusM = 4000): Zone[] {
  interface Cluster { lat: number; lon: number; members: RouteAnchor[]; }
  const clusters: Cluster[] = [];

  for (const a of anchors) {
    let best: Cluster | null = null;
    let bestD = radiusM;
    for (const c of clusters) {
      const d = fastDistanceMeters(c.lat, c.lon, a.lat, a.lon);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) {
      best.members.push(a);
      // centroide incremental
      const n = best.members.length;
      best.lat += (a.lat - best.lat) / n;
      best.lon += (a.lon - best.lon) / n;
    } else {
      clusters.push({ lat: a.lat, lon: a.lon, members: [a] });
    }
  }

  const maxCount = clusters.reduce((m, c) => Math.max(m, c.members.length), 1);
  return clusters
    .map((c, i) => {
      const longest = c.members.reduce((a, b) => (b.distanceMeters > a.distanceMeters ? b : a));
      return {
        id: i,
        label: longest.name,
        count: c.members.length,
        distanceMeters: c.members.reduce((s, m) => s + m.distanceMeters, 0),
        fraction: c.members.length / maxCount,
        lat: c.lat,
        lon: c.lon,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** Lugares más visitados: agrupa waypoints por título normalizado. */
export function computeTopPlaces(waypoints: WaypointLite[]): Place[] {
  const map = new Map<string, Place>();
  for (const w of waypoints) {
    const key = w.title.trim().toLowerCase();
    if (!key) continue;
    const e = map.get(key);
    if (e) e.count += 1;
    else map.set(key, { title: w.title.trim(), type: w.type, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
