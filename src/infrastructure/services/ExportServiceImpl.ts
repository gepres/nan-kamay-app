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
    }
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

  const trkptTags = gpsPoints
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
  const coordsTrack = gpsPoints
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
