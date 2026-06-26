import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Contactos de confianza para los check-in / S.O.S. de seguridad.
 * Se guardan SOLO en el dispositivo (AsyncStorage) — no hay backend ni se
 * suben a la nube (privacidad). El envío real es por SMS (compositor del SO).
 */
const KEY = 'nk:trusted-contacts';

export interface TrustedContact {
  id: string;
  name: string;
  /** Número tal cual lo ingresó el usuario (con o sin prefijo). */
  phone: string;
}

export async function getTrustedContacts(): Promise<TrustedContact[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function save(list: TrustedContact[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

/** Añade un contacto (ignora duplicados por teléfono normalizado). Devuelve la lista nueva. */
export async function addTrustedContact(name: string, phone: string): Promise<TrustedContact[]> {
  const list = await getTrustedContacts();
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  if (!cleanPhone) return list;
  const norm = (p: string) => p.replace(/[^\d]/g, '');
  if (list.some((c) => norm(c.phone) === norm(cleanPhone))) return list;
  const entry: TrustedContact = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: name.trim() || cleanPhone,
    phone: cleanPhone,
  };
  const next = [...list, entry];
  await save(next);
  return next;
}

/** Elimina un contacto por id. Devuelve la lista nueva. */
export async function removeTrustedContact(id: string): Promise<TrustedContact[]> {
  const next = (await getTrustedContacts()).filter((c) => c.id !== id);
  await save(next);
  return next;
}
