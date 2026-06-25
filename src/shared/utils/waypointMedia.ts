import {
  copyAsync,
  getInfoAsync,
  makeDirectoryAsync,
  documentDirectory,
} from 'expo-file-system/legacy';
import { uuidv4 } from '@shared/utils/uuid';
import { WaypointMedia } from '@core/entities/Waypoint';

/**
 * Persiste la media de un waypoint a almacenamiento estable.
 *
 * `ImagePicker` y `expo-audio` devuelven URIs en el CACHE de la app
 * (`cache/ImagePicker/...`), que Android purga sin aviso (limpieza del SO, poco
 * espacio, "borrar caché"). Si el archivo desaparece antes de sincronizar,
 * `uploadAsync` lanza `IOException` y tumbaba el sync de TODA la ruta. Por eso
 * copiamos el archivo (y su miniatura) a `documentDirectory/waypoint-media/` en
 * el momento de capturarlo, para que sobreviva hasta subirse. Mismo patrón que
 * la música del replay (`replayMusic.ts`).
 */
const MEDIA_DIR = (documentDirectory ?? '') + 'waypoint-media/';

async function ensureDir(): Promise<void> {
  const info = await getInfoAsync(MEDIA_DIR);
  if (!info.exists) await makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
}

function extOf(uri: string, fallback: string): string {
  const clean = uri.split('?')[0];
  const ext = clean.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : fallback;
}

/**
 * Copia una URI local efímera a `MEDIA_DIR` y devuelve la nueva. Si ya es `http`
 * o ya vive en `MEDIA_DIR`, la devuelve igual. Si la copia falla, devuelve la
 * original (mejor intentar subir algo que perderla con certeza).
 */
async function persistUri(uri: string, fallbackExt: string): Promise<string> {
  if (uri.startsWith('http') || uri.startsWith(MEDIA_DIR)) return uri;
  try {
    await ensureDir();
    const dest = `${MEDIA_DIR}${uuidv4()}.${extOf(uri, fallbackExt)}`;
    await copyAsync({ from: uri, to: dest });
    return dest;
  } catch (e) {
    console.warn('[media] no se pudo persistir, se usa la URI original', e);
    return uri;
  }
}

/**
 * Copia el archivo de media (y la miniatura de video) del cache efímero a
 * almacenamiento persistente. Devuelve el item con las URIs estables.
 */
export async function persistWaypointMedia(m: WaypointMedia): Promise<WaypointMedia> {
  const fallback = m.type === 'image' ? 'jpg' : m.type === 'video' ? 'mp4' : 'm4a';
  const uri = await persistUri(m.uri, fallback);
  const thumbnailUri = m.thumbnailUri ? await persistUri(m.thumbnailUri, 'jpg') : m.thumbnailUri;
  return { ...m, uri, thumbnailUri };
}
