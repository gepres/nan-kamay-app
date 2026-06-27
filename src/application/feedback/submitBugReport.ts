import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { NK_TABLES, NK_BUG_SHOTS_BUCKET } from '@infrastructure/supabase/tables';
import { ENV } from '@infrastructure/config/env';
import { uuidv4 } from '@shared/utils/uuid';

/**
 * Reporte de bug desde la app (in-house, sin terceros). Sube una captura opcional
 * al bucket PRIVADO `nk-bug-shots` y guarda la fila en `nk_bug_reports`. El admin lo
 * revisa por la consola de Supabase / Metabase. Requiere conexión (si falla, el
 * caller conserva el formulario).
 */

export interface BugReportInput {
  category: string;
  message: string;
  /** URI local de la captura (galería), opcional. */
  imageUri?: string | null;
  /** Pantalla donde estaba el usuario (patrón de segmento), opcional. */
  screen?: string | null;
}

/** Sube la captura al bucket privado (binario, patrón de MediaUploadService) y devuelve su path. */
async function uploadBugShot(localUri: string, userId: string): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sesión no disponible.');
  const rawExt = (localUri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
  const ext = rawExt.length <= 5 ? rawExt : 'jpg';
  const path = `${userId}/bug_${Date.now()}.${ext}`;
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const endpoint = `${ENV.SUPABASE_URL}/storage/v1/object/${NK_BUG_SHOTS_BUCKET}/${path}`;
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
    throw new Error(`No se pudo subir la captura (${res.status}).`);
  }
  return path;
}

export async function submitBugReport(input: BugReportInput, userId: string): Promise<void> {
  if (!input.message.trim()) throw new Error('Describe el problema.');
  let imagePath: string | null = null;
  if (input.imageUri && !input.imageUri.startsWith('http')) {
    imagePath = await uploadBugShot(input.imageUri, userId);
  }
  const { error } = await supabase.from(NK_TABLES.bugReports).insert({
    id: uuidv4(),
    user_id: userId,
    category: input.category || null,
    message: input.message.trim(),
    app_version: Constants.expoConfig?.version ?? null,
    platform: Platform.OS,
    os_version: String(Platform.Version),
    screen: input.screen ?? null,
    image_path: imagePath,
    status: 'open',
  });
  if (error) throw new Error(`No se pudo enviar el reporte: ${error.message}`);
}
