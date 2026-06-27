import { fastDistanceMeters } from '@shared/utils/geometry';

/**
 * Agrupación geográfica para la vista Lugares/Zonas — funciones PURAS.
 * La etiqueta base es el nombre de la ruta más larga del clúster (significativo y
 * offline). La pantalla la enriquece online con un nombre de lugar real vía
 * `ReverseGeocodeService` (con fallback a esta etiqueta si no hay red).
 */

export interface RouteAnchor {
  routeId: string;
  name: string;
  distanceMeters: number;
  elevationGainMeters: number;
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
  /** Desnivel acumulado de subida de las rutas de la zona (m). DEM-preciso si se ajustó. */
  elevationGainMeters: number;
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
        elevationGainMeters: c.members.reduce((s, m) => s + m.elevationGainMeters, 0),
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
