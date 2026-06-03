const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'docs', 'test-data');
const R = 6371000, rad = d => d * Math.PI / 180;
function hav(a, b, c, d) {
  const dLat = rad(c - a), dLon = rad(d - b);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const avg = arr => arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0;
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.csv'));
for (const f of files) {
  const lines = fs.readFileSync(path.join(DIR, f), 'utf8').trim().split(/\r?\n/);
  const hdr = lines[0].split(',').map(h => h.trim());
  const idx = Object.fromEntries(hdr.map((h, i) => [h, i]));
  const rows = lines.slice(1).map(l => l.split(','));
  const num = (r, k) => { const v = r[idx[k]]; return v === '' || v === undefined ? null : parseFloat(v); };
  let sumDist = 0, maxDt = 0, accs = [], segs = [], nAccHi = 0, dtGaps = [];
  for (const r of rows) {
    const d = num(r, 'dist_m'); if (d != null) sumDist += d;
    const dt = num(r, 'dt_s'); if (dt != null) { if (dt > maxDt) maxDt = dt; if (dt > 8) dtGaps.push(dt.toFixed(0)); }
    const a = num(r, 'accuracy_m'); if (a != null) { accs.push(a); if (a > 25) nAccHi++; }
    const s = num(r, 'seg_speed_kmh'); if (s != null) segs.push(s);
  }
  const first = rows[0], last = rows[rows.length - 1];
  const lat = r => num(r, 'lat'), lon = r => num(r, 'lon');
  const straight = hav(lat(first), lon(first), lat(last), lon(last));
  const durS = (new Date(last[idx['recorded_at']]) - new Date(first[idx['recorded_at']])) / 1000;
  console.log('\n=== ' + f + ' ===');
  console.log('  puntos: ' + rows.length + '   duración: ' + durS.toFixed(0) + 's (' + (durS / 60).toFixed(1) + ' min)');
  console.log('  dist acumulada (app): ' + sumDist.toFixed(1) + ' m');
  console.log('  línea recta inicio→fin: ' + straight.toFixed(1) + ' m');
  console.log('  accuracy → min ' + Math.min(...accs).toFixed(1) + ' / avg ' + avg(accs).toFixed(1) + ' / max ' + Math.max(...accs).toFixed(1) + '  (>25m: ' + nAccHi + '/' + accs.length + ')');
  console.log('  dt_s → max ' + maxDt.toFixed(1) + 's   huecos>8s: [' + dtGaps.join(', ') + ']');
  console.log('  seg_speed_kmh → max ' + Math.max(...segs).toFixed(1) + ' / avg(>0) ' + avg(segs.filter(x => x > 0)).toFixed(2));
}
