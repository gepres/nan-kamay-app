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

// ⚠️ protomaps-themes-base v4: layers() espera el OBJETO Theme, NO el string del
// tema. Hay que convertir el nombre con namedTheme(); si se pasa el string, la
// función lee theme.background/earth/water… como undefined y las capas salen
// SIN color → mapa NEGRO por defecto. labels() sí toma la key string + idioma.
const LANG = 'es';
const theme = m.namedTheme(THEME);
const base = m.layers(SOURCE, theme);
const labels = m.labels(SOURCE, THEME, LANG);
const all = [...base, ...labels];

// Renombrar las fuentes a versiones SIN ESPACIOS. MapLibre nativo construye la
// URL de glyphs sustituyendo {fontstack} con el nombre de la fuente; con
// espacios ("Noto Sans Regular") el file:// resultante puede no resolver. Con
// nombres sin espacios la ruta `fonts/<fuente>/<rango>.pbf` es inequívoca. El
// assets pack debe traer las carpetas con ESTOS mismos nombres.
const FONT_RENAME = {
  'Noto Sans Regular': 'NotoSans-Regular',
  'Noto Sans Medium': 'NotoSans-Medium',
  'Noto Sans Italic': 'NotoSans-Italic',
};
let allJson = JSON.stringify(all, null, 2);
for (const [from, to] of Object.entries(FONT_RENAME)) allJson = allJson.split(from).join(to);
const RENAMED_FONTS = JSON.stringify(Object.values(FONT_RENAME));

const out = `/**
 * Capas de estilo vector Protomaps (esquema basemaps v4) — GENERADO.
 * Fuente: protomaps-themes-base  ->  layers('${SOURCE}','${THEME}') + labels(...).
 * Regenerar:  node scripts/gen-protomaps-style.js
 *
 * Estas capas referencian el source vector '${SOURCE}' (un .pmtiles local).
 * Las etiquetas usan NotoSans-Regular / -Medium / -Italic (sin espacios, para
 * que la ruta file:// de glyphs resuelva). El assets pack debe traer esas carpetas.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PROTOMAPS_VECTOR_LAYERS: any[] = ${allJson};

/** Nombre del source vector que esperan las capas de arriba. */
export const PROTOMAPS_SOURCE_NAME = ${JSON.stringify(SOURCE)};

/** Tema usado al generar (para regenerar consistente). */
export const PROTOMAPS_THEME = ${JSON.stringify(THEME)};

/** Fuentes (fontstacks) que el assets pack offline debe traer como glyphs. */
export const PROTOMAPS_REQUIRED_FONTS = ${RENAMED_FONTS};
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'shared', 'constants', 'protomapsBasemap.ts'), out);
console.log(`gen-protomaps-style: ${all.length} layers escritas.`);
