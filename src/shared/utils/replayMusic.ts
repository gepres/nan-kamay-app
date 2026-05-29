import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import {
  copyAsync,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
  documentDirectory,
} from 'expo-file-system/legacy';

/**
 * Música de fondo del replay elegida por el usuario.
 *
 * No se integra con Spotify/Apple Music a propósito: sus términos prohíben
 * mezclar/sincronizar su audio con contenido propio (narración/video) y sus
 * SDKs no permiten "ducking". En su lugar el usuario elige una pista local
 * desde su dispositivo; la copiamos a `documentDirectory/music/` para que
 * persista (el URI del picker es temporal/caché) y guardamos la preferencia.
 */
export type ReplayMusicPref = { uri: string; name: string };

const KEY = 'replay_music_v1';
const MUSIC_DIR = (documentDirectory ?? '') + 'music/';

/** Devuelve la pista guardada, o `null` si no hay o el archivo ya no existe. */
export async function getReplayMusic(): Promise<ReplayMusicPref | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const pref = JSON.parse(raw) as ReplayMusicPref;
    const info = await getInfoAsync(pref.uri);
    if (!info.exists) {
      await AsyncStorage.removeItem(KEY);
      return null;
    }
    return pref;
  } catch {
    return null;
  }
}

/** Abre el selector de archivos de audio; copia y guarda la pista elegida. */
export async function pickReplayMusic(): Promise<ReplayMusicPref | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];

  // Borra la pista previa (si la hay) antes de copiar la nueva.
  await clearReplayMusic();
  await makeDirectoryAsync(MUSIC_DIR, { intermediates: true }).catch(() => {});

  const ext = (asset.name?.split('.').pop() ?? 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
  const dest = `${MUSIC_DIR}track.${ext}`;
  await copyAsync({ from: asset.uri, to: dest });

  const pref: ReplayMusicPref = { uri: dest, name: asset.name ?? 'Mi música' };
  await AsyncStorage.setItem(KEY, JSON.stringify(pref));
  return pref;
}

/** Elimina la pista guardada (archivo + preferencia). */
export async function clearReplayMusic(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const pref = JSON.parse(raw) as ReplayMusicPref;
      await deleteAsync(pref.uri, { idempotent: true }).catch(() => {});
    }
  } catch {
    /* noop */
  }
  await AsyncStorage.removeItem(KEY);
}
