// SDK 55: la API basada en funciones (readAsStringAsync) vive en /legacy.
// Importarla del módulo raíz lanza "method readAsStringAsync ... undefined"
// y aborta toda la sincronización de la ruta (imágenes + waypoints).
import { readAsStringAsync } from 'expo-file-system/legacy';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { NK_BUCKET } from '@infrastructure/supabase/tables';

const BUCKET = NK_BUCKET;

/**
 * Sube una imagen local (URI) a Supabase Storage.
 * Retorna la URL pública del archivo subido.
 */
export async function uploadWaypointImage(
  localUri: string,
  userId: string,
  waypointId: string,
): Promise<string> {
  // Leer el archivo como base64
  const base64 = await readAsStringAsync(localUri, { encoding: 'base64' });

  // Determinar el tipo MIME desde la extensión
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  // Path en el bucket: userId/waypointId/timestamp.ext
  const storagePath = `${userId}/${waypointId}/${Date.now()}.${ext}`;

  // Convertir base64 a Uint8Array para Supabase
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) throw new Error(`Error subiendo imagen: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Sube todas las imágenes locales de un waypoint y retorna las URLs remotas.
 * Las URIs que ya son URLs (https://) se devuelven sin modificar.
 */
export async function uploadWaypointImages(
  localUris: string[],
  userId: string,
  waypointId: string,
): Promise<string[]> {
  const results: string[] = [];
  for (const uri of localUris) {
    if (uri.startsWith('http')) {
      results.push(uri); // ya está subida
    } else {
      const url = await uploadWaypointImage(uri, userId, waypointId);
      results.push(url);
    }
  }
  return results;
}
