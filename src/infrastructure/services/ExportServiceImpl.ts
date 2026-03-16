import {
  readAsStringAsync,
  writeAsStringAsync,
  makeDirectoryAsync,
  getInfoAsync,
  documentDirectory,
} from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { IExportService, ExportFormat } from '@core/ports/services/IExportService';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';

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

  // ── GPX ────────────────────────────────────────────────────────

  private async exportGpx(
    route: Route,
    gpsPoints: GpsPoint[],
    waypoints: Waypoint[],
  ): Promise<string> {
    const content = buildGpx(route, gpsPoints, waypoints);
    const fileName = `${sanitizeName(route.name)}.gpx`;
    return writeFile(fileName, content, 'text');
  }

  // ── KML ────────────────────────────────────────────────────────

  private async exportKml(
    route: Route,
    gpsPoints: GpsPoint[],
    waypoints: Waypoint[],
  ): Promise<string> {
    const content = buildKml(route, gpsPoints, waypoints);
    const fileName = `${sanitizeName(route.name)}.kml`;
    return writeFile(fileName, content, 'text');
  }

  // ── KMZ ────────────────────────────────────────────────────────

  private async exportKmz(
    route: Route,
    gpsPoints: GpsPoint[],
    waypoints: Waypoint[],
  ): Promise<string> {
    const zip = new JSZip();
    zip.file('doc.kml', buildKml(route, gpsPoints, waypoints));

    // Embeber imágenes locales de waypoints
    for (const wp of waypoints) {
      for (let i = 0; i < wp.imageUris.length; i++) {
        const uri = wp.imageUris[i];
        if (!uri.startsWith('http')) {
          const base64 = await readAsStringAsync(uri, { encoding: 'base64' });
          const ext = uri.split('.').pop() ?? 'jpg';
          zip.file(`images/${wp.id}_${i}.${ext}`, base64, { base64: true });
        }
      }
    }

    const base64Zip = await zip.generateAsync({ type: 'base64' });
    const fileName = `${sanitizeName(route.name)}.kmz`;
    return writeFile(fileName, base64Zip, 'base64');
  }
}

export const exportService = new ExportServiceImpl();

// ── Helpers ─────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]/g, '_').trim();
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
  }
  const path = dir + fileName;
  await writeAsStringAsync(path, content, {
    encoding: encoding === 'base64' ? 'base64' : 'utf8',
  });
  return path;
}

// ── Generadores de formato ───────────────────────────────────────

function buildGpx(route: Route, gpsPoints: GpsPoint[], waypoints: Waypoint[]): string {
  const wptTags = waypoints
    .map(
      (wp) =>
        `  <wpt lat="${wp.latitude}" lon="${wp.longitude}">
    ${wp.altitude != null ? `<ele>${wp.altitude.toFixed(1)}</ele>` : ''}
    <time>${wp.createdAt.toISOString()}</time>
    <name>${escXml(wp.title)}</name>
    ${wp.description ? `<desc>${escXml(wp.description)}</desc>` : ''}
    <sym>Flag</sym>
  </wpt>`,
    )
    .join('\n');

  const trkptTags = gpsPoints
    .map(
      (p) =>
        `      <trkpt lat="${p.latitude}" lon="${p.longitude}">
        ${p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : ''}
        <time>${p.recordedAt.toISOString()}</time>
        ${p.speed != null ? `<extensions><speed>${p.speed.toFixed(2)}</speed></extensions>` : ''}
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
    <time>${route.startedAt.toISOString()}</time>
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

function buildKml(route: Route, gpsPoints: GpsPoint[], waypoints: Waypoint[]): string {
  const coordsTrack = gpsPoints
    .map((p) => `${p.longitude},${p.latitude},${p.altitude ?? 0}`)
    .join('\n          ');

  const placemarks = waypoints
    .map(
      (wp) =>
        `    <Placemark>
      <name>${escXml(wp.title)}</name>
      ${wp.description ? `<description>${escXml(wp.description)}</description>` : ''}
      <styleUrl>#waypointStyle</styleUrl>
      <Point>
        <coordinates>${wp.longitude},${wp.latitude},${wp.altitude ?? 0}</coordinates>
      </Point>
    </Placemark>`,
    )
    .join('\n');

  const distKm = (route.distanceMeters / 1000).toFixed(2);
  const durationH = Math.floor(route.durationSeconds / 3600);
  const durationM = Math.floor((route.durationSeconds % 3600) / 60);

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escXml(route.name)}</name>
    <description>Distancia: ${distKm} km | Duración: ${durationH}h ${durationM}m | Dificultad: ${route.difficulty}</description>

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

function escXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
