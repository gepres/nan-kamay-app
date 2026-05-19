/**
 * Genera un UUID v4 válido (RFC 4122).
 *
 * Se usa para los IDs de filas que se sincronizan con Postgres (columnas `uuid`).
 * Implementación en JS puro (sin dependencia nativa): suficiente para IDs de
 * registros — no es para tokens criptográficos. El formato es siempre
 * `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` con y ∈ {8,9,a,b}, que Postgres acepta.
 */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
