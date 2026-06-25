import { uploadAsync, getInfoAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { NK_MEDIA_BUCKET } from '@infrastructure/supabase/tables';
import { ENV } from '@infrastructure/config/env';
import { WaypointMedia } from '@core/entities/Waypoint';

/**
 * Sube media de waypoints (foto/video/audio) a Supabase Storage usando subida
 * BINARIA por archivo (FileSystem.uploadAsync) en vez de base64. Esto es clave
 * para los videos: leerlos a base64 en memoria reventaría la RAM.
 *
 * Idempotente: una URI que ya es `http(s)` se devuelve sin re-subir.
 */

function extFromUri(uri: string, fallback: string): string {
  const clean = uri.split('?')[0];
  const ext = clean.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : fallback;
}

function mimeFor(type: WaypointMedia['type'], ext: string): string {
  if (type === 'image') return ext === 'png' ? 'image/png' : 'image/jpeg';
  if (type === 'video') return ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  // audio (m4a/aac → audio/mp4 es lo más compatible)
  return ext === 'm4a' || ext === 'mp4' || ext === 'aac' ? 'audio/mp4' : 'audio/mpeg';
}

/** Sube un archivo local a Storage y devuelve su URL pública. */
async function uploadFile(localUri: string, path: string, contentType: string): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sesión no disponible para subir media.');

  const endpoint = `${ENV.SUPABASE_URL}/storage/v1/object/${NK_MEDIA_BUCKET}/${path}`;
  const res = await uploadAsync(endpoint, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ENV.SUPABASE_ANON_KEY,
      'x-upsert': 'true',
      'Content-Type': contentType,
    },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Subida media (${res.status}): ${res.body?.slice(0, 200) ?? ''}`);
  }
  return supabase.storage.from(NK_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Sube toda la media local de un waypoint y devuelve la media con URLs remotas.
 * Las que ya son `http` se dejan igual (no se re-suben).
 */
export async function uploadWaypointMedia(
  media: WaypointMedia[],
  userId: string,
  waypointId: string,
): Promise<WaypointMedia[]> {
  const out: WaypointMedia[] = [];
  let i = 0;
  for (const m of media) {
    i++;
    if (m.uri.startsWith('http')) {
      out.push(m); // ya subido
      continue;
    }

    // Resiliencia: la URI local puede haber desaparecido. ImagePicker guarda en
    // el cache efímero (`cache/ImagePicker/...`), que Android purga sin aviso; si
    // el archivo ya no existe, `uploadAsync` lanzaba IOException y tumbaba el sync
    // de TODA la ruta. Si falta, descartamos esa media (ya es irrecuperable) y
    // seguimos: la ruta y el resto de media sí suben. Al caer de `out`, el caller
    // la poda de SQLite y deja de reintentarla.
    const info = await getInfoAsync(m.uri);
    if (!info.exists) {
      console.warn(`[media] archivo local ausente, se omite del sync: ${m.uri}`);
      continue;
    }

    const ext = extFromUri(m.uri, m.type === 'image' ? 'jpg' : m.type === 'video' ? 'mp4' : 'm4a');
    const stamp = `${i}_${userId.slice(0, 8)}`;
    const path = `${userId}/${waypointId}/${m.type}_${stamp}.${ext}`;
    const url = await uploadFile(m.uri, path, mimeFor(m.type, ext));

    // Miniatura de video (si es local y todavía existe).
    let thumbnailUri = m.thumbnailUri;
    if (m.type === 'video' && thumbnailUri && !thumbnailUri.startsWith('http')) {
      const tInfo = await getInfoAsync(thumbnailUri);
      if (tInfo.exists) {
        const tExt = extFromUri(thumbnailUri, 'jpg');
        const tPath = `${userId}/${waypointId}/thumb_${stamp}.${tExt}`;
        thumbnailUri = await uploadFile(thumbnailUri, tPath, 'image/jpeg');
      } else {
        thumbnailUri = undefined;
      }
    }

    out.push({ ...m, uri: url, thumbnailUri });
  }
  return out;
}
