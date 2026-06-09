/**
 * Genera `src/shared/constants/protomapsBasemap.ts` a partir de
 * `protomaps-themes-base` (devDependency). Inlinear las capas evita depender del
 * paquete en runtime (sin riesgos de bundling ESM/CJS en React Native).
 *
 * Uso:  node scripts/gen-protomaps-style.js
 * Requiere:  npm i -D protomaps-themes-base
 */
const fs = require('fs');
const path = require('path');

const SOURCE = 'protomaps';
const THEME = 'light'; // temas: light | dark | white | grayscale | black ...
const m = require('protomaps-themes-base');

const base = m.layers(SOURCE, THEME);
const labels = m.labels(SOURCE, THEME);
const all = [...base, ...labels];

const out = `/**
 * Capas de estilo vector Protomaps (esquema basemaps v4) — GENERADO.
 * Fuente: protomaps-themes-base  ->  layers('${SOURCE}','${THEME}') + labels(...).
 * Regenerar:  node scripts/gen-protomaps-style.js
 *
 * Estas capas referencian el source vector '${SOURCE}' (un .pmtiles local).
 * Las etiquetas usan Noto Sans Regular / Medium / Italic (glyphs del assets pack).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PROTOMAPS_VECTOR_LAYERS: any[] = ${JSON.stringify(all, null, 2)};

/** Nombre del source vector que esperan las capas de arriba. */
export const PROTOMAPS_SOURCE_NAME = ${JSON.stringify(SOURCE)};

/** Tema usado al generar (para regenerar consistente). */
export const PROTOMAPS_THEME = ${JSON.stringify(THEME)};

/** Fuentes (fontstacks) que el assets pack offline debe traer como glyphs. */
export const PROTOMAPS_REQUIRED_FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'shared', 'constants', 'protomapsBasemap.ts'), out);
console.log(`gen-protomaps-style: ${all.length} layers escritas.`);
