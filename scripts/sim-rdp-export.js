/**
 * Simula el efecto de GPS-2 (RDP en export, epsilon = ROUTE_SIMPLIFY_EPSILON_M)
 * sobre los CSV reales (que son post-One-Euro, igual que lo que va al GPX/KML).
 * Muestra cuánto se endereza el track exportado: puntos, distancia y cross-track
 * RMS antes vs después. NO toca datos; solo demuestra el impacto.
 *
 *   node scripts/sim-rdp-export.js
 */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'docs', 'test-data');
const EPS = 5; // ROUTE_SIMPLIFY_EPSILON_M
const R = 6371000, rad = (d) => (d * Math.PI) / 180;

function rows(file) {
  const L = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const h = L[0].split(',').map((s) => s.trim());
  const iLat = h.indexOf('lat'), iLon = h.indexOf('lon');
  return L.slice(1).map((l) => { const c = l.split(','); return [parseFloat(c[iLon]), parseFloat(c[iLat])]; })
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}
function hav(a, b, c, d) { // lat1,lon1,lat2,lon2
  const dLat = rad(c - a), dLon = rad(d - b);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function dist(coords) { let s = 0; for (let i = 1; i < coords.length; i++) s += hav(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]); return s; }
function rdp(coords, eps) {
  const n = coords.length; if (n <= 2) return coords.slice();
  const lat0 = coords[0][1], mLat = 111320, mLon = 111320 * Math.cos(rad(lat0));
  const X = coords.map(([lon, lat]) => [(lon - coords[0][0]) * mLon, (lat - lat0) * mLat]);
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [s, e] = st.pop(); const [ax, ay] = X[s], [bx, by] = X[e];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let idx = -1, maxD = eps;
    for (let i = s + 1; i < e; i++) { const [px, py] = X[i];
      const d = len < 1e-9 ? Math.hypot(px - ax, py - ay) : Math.abs((px - ax) * (-dy) + (py - ay) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; } }
    if (idx !== -1) { keep[idx] = 1; st.push([s, idx]); st.push([idx, e]); }
  }
  return coords.filter((_, i) => keep[i]);
}
function crossRms(coords) { // desviación de cada punto a la recta de mejor ajuste (PCA)
  const lat0 = coords[0][1], mLat = 111320, mLon = 111320 * Math.cos(rad(lat0));
  const P = coords.map(([lon, lat]) => [(lon - coords[0][0]) * mLon, (lat - lat0) * mLat]);
  const n = P.length; let mx = 0, my = 0; for (const p of P) { mx += p[0]; my += p[1]; } mx /= n; my /= n;
  let cxx = 0, cyy = 0, cxy = 0; for (const p of P) { const dx = p[0] - mx, dy = p[1] - my; cxx += dx * dx; cyy += dy * dy; cxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy), nx = -Math.sin(th), ny = Math.cos(th);
  let s = 0; for (const p of P) { const c = (p[0] - mx) * nx + (p[1] - my) * ny; s += c * c; }
  return Math.sqrt(s / n);
}

for (const f of fs.readdirSync(DIR).filter((x) => /^prueba-.*\.csv$/.test(x))) {
  const c = rows(path.join(DIR, f)); const s = rdp(c, EPS);
  const d0 = dist(c), d1 = dist(s);
  const straight = /recta/.test(f);
  console.log(`\n${f}`);
  console.log(`  puntos ${c.length} → ${s.length}  (-${(100 * (1 - s.length / c.length)).toFixed(0)}%)`);
  console.log(`  distancia ${d0.toFixed(0)} m → ${d1.toFixed(0)} m  (${(d1 - d0 >= 0 ? '+' : '')}${(d1 - d0).toFixed(0)} m, ${(100 * (d1 / d0 - 1)).toFixed(1)}%)`);
  if (straight) console.log(`  cross-track RMS ${crossRms(c).toFixed(2)} m → ${crossRms(s).toFixed(2)} m`);
}
