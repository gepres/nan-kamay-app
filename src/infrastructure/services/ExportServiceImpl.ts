import {
  readAsStringAsync,
  writeAsStringAsync,
  makeDirectoryAsync,
  getInfoAsync,
  readDirectoryAsync,
  deleteAsync,
  documentDirectory,
} from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { IExportService, ExportFormat } from '@core/ports/services/IExportService';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { simplifyIndices } from '@shared/utils/geometry';

/** Mapa waypointId → rutas relativas de imágenes embebidas en el KMZ. */
type EmbeddedImages = Record<string, string[]>;

// Caracteres de control ilegales en XML 1.0 (se conservan TAB, LF, CR).
const XML_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export class ExportServiceImpl implements IExportService {
  async exportRoute(
    route: Route,
    gpsPoints: GpsPoint[],
    waypoints: Waypoint[],
    format: ExportFormat,
  ): Promise<string> {
    switch (format) {
      case 'gpx': return this.exportGpx(route, gpsPoints, waypoints);
      case 'kml': return this.exportKml(route, gpsPoints, waypoints);
      case 'kmz': return this.exportKmz(route, gpsPoints, waypoints);
      case 'csv': return this.exportCsv(route, gpsPoints);
    }
  }

  /**
   * CSV de DIAGNÓSTICO (no es un formato de usuario final): vuelca los puntos
   * GPS crudos tal como quedaron en SQLite, con columnas derivadas, para
   * depurar la grabación. No necesita waypoints.
   */
  private async exportCsv(route: Route, gpsPoints: GpsPoint[]): Promise<string> {
    const content = buildDiagnosticsCsv(gpsPoints);
    return writeFile(`${sanitizeName(route.name)}-diagnostico.csv`, content, 'text');
  }

  private async exportGpx(route: Route, gpsPoints: GpsPoint[], waypoints: Waypoint[]): Promise<string> {
    const content = buildGpx(route, gpsPoints, waypoints);
    return writeFile(`${sanitizeName(route.name)}.gpx`, content, 'text');
  }

  private async exportKml(route: Route, gpsPoints: GpsPoint[], waypoints: Waypoint[]): Promise<string> {
    const content = buildKml(route, gpsPoints, waypoints);
    return writeFile(`${sanitizeName(route.name)}.kml`, content, 'text');
  }

  private async exportKmz(route: Route, gpsPoints: GpsPoint[], waypoints: Waypoint[]): Promise<string> {
    const zip = new JSZip();
    const embedded: EmbeddedImages = {};

    for (const wp of waypoints) {
      for (let i = 0; i < wp.imageUris.length; i++) {
        const uri = wp.imageUris[i];
        if (uri.startsWith('http')) continue; // remota: no se embebe
        try {
          const base64 = await readAsStringAsync(uri, { encoding: 'base64' });
          const ext = (uri.split('?')[0].split('#')[0].split('.').pop() || 'jpg').toLowerCase();
          const rel = `images/${wp.id}_${i}.${ext}`;
          zip.file(rel, base64, { base64: true });
          (embedded[wp.id] ??= []).push(rel);
        } catch (e) {
          // Imagen local borrada/inaccesible: omitir esa imagen, no abortar el KMZ.
          console.warn('[export] no se pudo embeber imagen', uri, e);
        }
      }
    }

    zip.file('doc.kml', buildKml(route, gpsPoints, waypoints, embedded));
    const base64Zip = await zip.generateAsync({ type: 'base64' });
    return writeFile(`${sanitizeName(route.name)}.kmz`, base64Zip, 'base64');
  }
}

export const exportService = new ExportServiceImpl();

// ── Helpers ─────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'ruta';
}

async function writeFile(
  fileName: string,
  content: string,
  encoding: 'text' | 'base64',
): Promise<string> {
  const dir = (documentDirectory ?? '') + 'exports/';
  const dirInfo = await getInfoAsync(dir);
  if (!dirInfo.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  } else {
    // Limpiar exports anteriores (cada export es transitorio: se comparte al
    // instante). Evita fuga de almacenamiento. Best-effort.
    try {
      const files = await readDirectoryAsync(dir);
      await Promise.all(
        files.map((f) => deleteAsync(dir + f, { idempotent: true })),
      );
    } catch {
      // ignore
    }
  }
  const path = dir + fileName;
  await writeAsStringAsync(path, content, {
    encoding: encoding === 'base64' ? 'base64' : 'utf8',
  });
  return path;
}

/** Número finito o `fallback` (evita NaN/Infinity en el XML). */
function num(v: number | null | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** ISO date seguro (Date inválida → epoch). */
function iso(d: Date): string {
  return d instanceof Date && !Number.isNaN(d.getTime())
    ? d.toISOString()
    : new Date(0).toISOString();
}

/** Escapa para XML y elimina chars de control ilegales en XML 1.0. */
function escXml(str: string): string {
  return String(str)
    .replace(XML_CONTROL_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Hace seguro un texto dentro de CDATA (rompe la secuencia `]]>`). */
function cdataSafe(str: string): string {
  return String(str)
    .replace(XML_CONTROL_CHARS, '')
    .replace(/]]>/g, ']]]]><![CDATA[>');
}

// ── Generadores de formato ───────────────────────────────────────

/**
 * Reduce el track con RDP (epsilon por defecto ≈ error GPS) conservando los
 * GpsPoint completos (altitud/tiempo/velocidad de los vértices que sobreviven).
 * Solo para los formatos de VISUALIZACIÓN (GPX/KML/KMZ): colapsa el serpenteo
 * lateral de baja frecuencia que el suavizado en tiempo real no puede quitar.
 * El CSV de diagnóstico NO se simplifica (necesita todos los puntos), y los
 * gps_points guardados/sincronizados quedan intactos (fidelidad de backup).
 */
function simplifyTrack(points: GpsPoint[]): GpsPoint[] {
  if (points.length <= 2) return points;
  const coords = points.map((p) => [p.longitude, p.latitude] as [number, number]);
  return simplifyIndices(coords).map((i) => points[i]);
}

function buildGpx(route: Route, gpsPoints: GpsPoint[], waypoints: Waypoint[]): string {
  const wptTags = waypoints
    .map(
      (wp) =>
        `  <wpt lat="${num(wp.latitude)}" lon="${num(wp.longitude)}">
    ${wp.altitude != null ? `<ele>${num(wp.altitude).toFixed(1)}</ele>` : ''}
    <time>${iso(wp.createdAt)}</time>
    <name>${escXml(wp.title)}</name>
    ${wp.description ? `<desc>${escXml(wp.description)}</desc>` : ''}
    <sym>Flag</sym>
  </wpt>`,
    )
    .join('\n');

  const trkptTags = simplifyTrack(gpsPoints)
    .map(
      (p) =>
        `      <trkpt lat="${num(p.latitude)}" lon="${num(p.longitude)}">
        ${p.altitude != null ? `<ele>${num(p.altitude).toFixed(1)}</ele>` : ''}
        <time>${iso(p.recordedAt)}</time>
        ${p.speed != null ? `<extensions><speed>${num(p.speed).toFixed(2)}</speed></extensions>` : ''}
      </trkpt>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ñan Kamay"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escXml(route.name)}</name>
    <time>${iso(route.startedAt)}</time>
  </metadata>
${wptTags}
  <trk>
    <name>${escXml(route.name)}</name>
    <trkseg>
${trkptTags}
    </trkseg>
  </trk>
</gpx>`;
}

function buildKml(
  route: Route,
  gpsPoints: GpsPoint[],
  waypoints: Waypoint[],
  embedded?: EmbeddedImages,
): string {
  const coordsTrack = simplifyTrack(gpsPoints)
    .map((p) => `${num(p.longitude)},${num(p.latitude)},${num(p.altitude)}`)
    .join('\n          ');

  const placemarks = waypoints
    .map((wp) => {
      const imgs = embedded?.[wp.id] ?? [];
      let descTag = '';
      if (imgs.length > 0) {
        // KMZ: descripción con imágenes embebidas (HTML en CDATA).
        const parts: string[] = [];
        if (wp.description) parts.push(cdataSafe(wp.description));
        parts.push(imgs.map((rel) => `<img src="${rel}" width="320" />`).join(''));
        descTag = `<description><![CDATA[${parts.join('<br/>')}]]></description>`;
      } else if (wp.description) {
        descTag = `<description>${escXml(wp.description)}</description>`;
      }
      return `    <Placemark>
      <name>${escXml(wp.title)}</name>
      ${descTag}
      <styleUrl>#waypointStyle</styleUrl>
      <Point>
        <coordinates>${num(wp.longitude)},${num(wp.latitude)},${num(wp.altitude)}</coordinates>
      </Point>
    </Placemark>`;
    })
    .join('\n');

  const distKm = (num(route.distanceMeters) / 1000).toFixed(2);
  const durationH = Math.floor(num(route.durationSeconds) / 3600);
  const durationM = Math.floor((num(route.durationSeconds) % 3600) / 60);

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escXml(route.name)}</name>
    <description>Distancia: ${distKm} km | Duración: ${durationH}h ${durationM}m | Dificultad: ${escXml(route.difficulty)}</description>

    <Style id="trackStyle">
      <LineStyle>
        <color>ff22c55e</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Style id="waypointStyle">
      <IconStyle>
        <color>ff0bf5f5</color>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/ylw-blank.png</href></Icon>
      </IconStyle>
    </Style>

${placemarks}

    <Placemark>
      <name>${escXml(route.name)}</name>
      <styleUrl>#trackStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>
          ${coordsTrack}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
}

// ── Diagnóstico ──────────────────────────────────────────────────

/**
 * CSV de diagnóstico de la grabación. Vuelca los puntos GPS (post-filtro, tal
 * como quedaron en SQLite) MÁS columnas derivadas para no recalcular a mano:
 *
 *   seq            sequence_index del punto
 *   recorded_at    timestamp ISO
 *   dt_s           segundos desde el punto anterior (detecta gaps de muestreo)
 *   lat, lon       coordenadas SIN truncar (fidelidad para recomputar distancia)
 *   dist_m         distancia haversine al punto anterior
 *   seg_speed_kmh  velocidad REAL del segmento (dist/dt) — la fiable; contrasta
 *                  con gps_speed_kmh, que en Android suele venir 0/vacío
 *   gps_speed_ms   speed crudo del sensor (m/s), vacío si el SO no lo reportó
 *   gps_speed_kmh  speed del sensor en km/h
 *   altitude_m     altitud guardada (ya fusionada/filtrada en su momento)
 *   accuracy_m     precisión horizontal — NO la lleva ningún otro export y es
 *                  la entrada del gate de precisión del filtro
 *
 * Campos numéricos no disponibles (null/NaN) quedan vacíos para distinguirlos
 * de un 0 real.
 */
function buildDiagnosticsCsv(gpsPoints: GpsPoint[]): string {
  const header =
    'seq,recorded_at,dt_s,lat,lon,dist_m,seg_speed_kmh,gps_speed_ms,gps_speed_kmh,altitude_m,accuracy_m';

  // Robusto ante cualquier orden de entrada.
  const points = [...gpsPoints].sort((a, b) => a.sequenceIndex - b.sequenceIndex);

  const lines = [header];
  let prev: GpsPoint | null = null;

  for (const p of points) {
    let dtS = '';
    let distM = '';
    let segKmh = '';
    if (prev) {
      const dt = (p.recordedAt.getTime() - prev.recordedAt.getTime()) / 1000;
      const d = haversineMeters(prev.latitude, prev.longitude, p.latitude, p.longitude);
      dtS = csvNum(dt, 1);
      distM = csvNum(d, 2);
      if (dt > 0) segKmh = csvNum((d / dt) * 3.6, 2);
    }

    lines.push(
      [
        p.sequenceIndex,
        iso(p.recordedAt),
        dtS,
        csvCoord(p.latitude),
        csvCoord(p.longitude),
        distM,
        segKmh,
        csvNum(p.speed, 2),
        p.speed != null ? csvNum(p.speed * 3.6, 2) : '',
        csvNum(p.altitude, 1),
        csvNum(p.accuracy, 1),
      ].join(','),
    );
    prev = p;
  }

  return lines.join('\n');
}

/** Campo numérico CSV: null/NaN/Infinity → vacío; si no, toFixed(decimals). */
function csvNum(v: number | null | undefined, decimals: number): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(decimals) : '';
}

/** Coordenada CSV sin truncar (máxima fidelidad). No-finito → vacío. */
function csvCoord(v: number): string {
  return Number.isFinite(v) ? String(v) : '';
}

/** Distancia haversine en metros (columnas derivadas del CSV de diagnóstico). */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
