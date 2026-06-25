/**
 * Análisis profundo de los CSV de diagnóstico (post-filtro One Euro, sin RDP).
 * Cuantifica lo que el ojo ve: serpenteo lateral (cross-track), reversiones de
 * rumbo ("se mueve y regresa"), atajos de curva (huecos temporales + saltos),
 * y densidad. Sólo procesa los archivos `prueba-*.csv` salvo que se pasen args.
 *
 *   node scripts/analyze-gps-deep.js [archivo.csv ...]
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'docs', 'test-data');
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const hdr = lines[0].split(',').map((h) => h.trim());
  const idx = Object.fromEntries(hdr.map((h, i) => [h, i]));
  const num = (cells, k) => {
    const v = cells[idx[k]];
    return v === '' || v === undefined ? null : parseFloat(v);
  };
  return lines.slice(1).map((l) => {
    const c = l.split(',');
    return {
      seq: num(c, 'seq'),
      t: new Date(c[idx['recorded_at']]).getTime(),
      dt: num(c, 'dt_s'),
      lat: num(c, 'lat'),
      lon: num(c, 'lon'),
      dist: num(c, 'dist_m'),
      seg: num(c, 'seg_speed_kmh'),
      acc: num(c, 'accuracy_m'),
    };
  });
}

/** lat/lon → metros locales (este x, norte y) relativos al primer punto. */
function toLocal(rows) {
  const o = rows[0];
  const cl = Math.cos(rad(o.lat));
  return rows.map((r) => ({
    ...r,
    x: rad(r.lon - o.lon) * cl * R,
    y: rad(r.lat - o.lat) * R,
  }));
}

/** PCA 2D → dirección principal u y normal n, pasando por el centroide. */
function pca(pts) {
  const n = pts.length;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  let cxx = 0, cyy = 0, cxy = 0;
  for (const p of pts) {
    const dx = p.x - mx, dy = p.y - my;
    cxx += dx * dx; cyy += dy * dy; cxy += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  return { mx, my, u: { x: Math.cos(theta), y: Math.sin(theta) }, nrm: { x: -Math.sin(theta), y: Math.cos(theta) } };
}

const rms = (a) => (a.length ? Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length) : 0);
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

/** Cross-track global respecto a la recta de mejor ajuste (para rectas). */
function straightnessGlobal(pts) {
  const fit = pca(pts);
  const cross = pts.map((p) => (p.x - fit.mx) * fit.nrm.x + (p.y - fit.my) * fit.nrm.y);
  const along = pts.map((p) => (p.x - fit.mx) * fit.u.x + (p.y - fit.my) * fit.u.y);
  // zero-crossings del cross ordenado por seq = nº de "cruces" del eje (serpenteo)
  let crossings = 0;
  for (let i = 1; i < cross.length; i++) if (Math.sign(cross[i]) !== Math.sign(cross[i - 1]) && cross[i] !== 0) crossings++;
  // retrocesos en along (se mueve y regresa)
  let backsteps = 0, backDist = 0;
  for (let i = 1; i < along.length; i++) {
    const d = along[i] - along[i - 1];
    if (d < 0) { backsteps++; backDist += -d; }
  }
  return {
    crossRms: rms(cross), crossMax: Math.max(...cross.map(Math.abs)),
    crossings, backsteps, backDist, n: pts.length,
  };
}

/** Cross-track local: desviación de cada punto respecto a la recta de su ventana. */
function roughnessLocal(pts, win = 2) {
  const out = [];
  for (let i = win; i < pts.length - win; i++) {
    const seg = pts.slice(i - win, i + win + 1);
    const fit = pca(seg);
    out.push(Math.abs((pts[i].x - fit.mx) * fit.nrm.x + (pts[i].y - fit.my) * fit.nrm.y));
  }
  return { rms: rms(out), max: out.length ? Math.max(...out) : 0, p95: pct(out, 95) };
}

/** Ángulos de giro entre segmentos consecutivos (ignora pasos < minStep m). */
function turning(pts, minStep = 2) {
  const angles = [];
  let prev = pts[0];
  const kept = [prev];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y);
    if (d >= minStep) { kept.push(pts[i]); prev = pts[i]; }
  }
  for (let i = 1; i < kept.length - 1; i++) {
    const v1 = { x: kept[i].x - kept[i - 1].x, y: kept[i].y - kept[i - 1].y };
    const v2 = { x: kept[i + 1].x - kept[i].x, y: kept[i + 1].y - kept[i].y };
    const cross = v1.x * v2.y - v1.y * v2.x;
    const dot = v1.x * v2.x + v1.y * v2.y;
    angles.push(Math.abs(deg(Math.atan2(cross, dot))));
  }
  const reversals = angles.filter((a) => a > 90).length;
  const sharp = angles.filter((a) => a > 45).length;
  return { keptPts: kept.length, meanAbs: avg(angles), totalCurv: angles.reduce((s, v) => s + v, 0), sharp, reversals };
}

/** Huecos temporales (dt>8s): clasifica parada real vs salto caminando. */
function gaps(rows) {
  const g = [];
  for (const r of rows) {
    if (r.dt != null && r.dt > 8) {
      // velocidad implícita del salto: si camina ~5 km/h y el hueco es de Ts,
      // un salto "real caminando" cubriría ~1.4*T m. Mucho menos ⇒ estuvo parado.
      const expected = 1.4 * r.dt; // 5 km/h
      const kind = r.dist == null ? '?' : r.dist > 0.5 * expected ? 'CAMINANDO' : 'parada';
      g.push({ seq: r.seq, dt: r.dt, dist: r.dist, seg: r.seg, acc: r.acc, kind });
    }
  }
  return g;
}

function analyze(file) {
  const name = path.basename(file);
  const rows0 = readCsv(file).filter((r) => r.lat != null && r.lon != null);
  if (rows0.length < 3) { console.log(`\n### ${name}: <3 puntos`); return; }
  const pts = toLocal(rows0);
  const isStraight = /linea-recta|recta/i.test(name);

  const dur = (rows0[rows0.length - 1].t - rows0[0].t) / 1000;
  const dists = rows0.map((r) => r.dist).filter((d) => d != null);
  const totalDist = dists.reduce((s, v) => s + v, 0);
  const t = turning(pts);
  const gp = gaps(rows0);
  const gpWalk = gp.filter((g) => g.kind === 'CAMINANDO');
  const bigJumps = rows0.filter((r) => r.dist != null && r.dist > 12);

  console.log(`\n### ${name}`);
  console.log(`  pts ${rows0.length} · ${(dur / 60).toFixed(1)} min · ${totalDist.toFixed(0)} m · densidad ${(rows0.length / (totalDist / 100)).toFixed(1)} pt/100m, ${(rows0.length / (dur / 60)).toFixed(1)} pt/min`);
  console.log(`  dist_m: min ${Math.min(...dists).toFixed(1)} / med ${pct(dists, 50).toFixed(1)} / p95 ${pct(dists, 95).toFixed(1)} / max ${Math.max(...dists).toFixed(1)}  · <5m: ${dists.filter((d) => d < 5).length}/${dists.length}`);

  if (isStraight) {
    const s = straightnessGlobal(pts);
    console.log(`  RECTA → cross-track RMS ${s.crossRms.toFixed(2)} m · max ${s.crossMax.toFixed(2)} m · cruces eje ${s.crossings} · retrocesos ${s.backsteps} (${s.backDist.toFixed(1)} m acum)`);
  }
  const rl = roughnessLocal(pts);
  console.log(`  rugosidad local (cross 5-pt): RMS ${rl.rms.toFixed(2)} m · p95 ${rl.p95.toFixed(2)} m · max ${rl.max.toFixed(2)} m`);
  console.log(`  giros (paso≥2m, ${t.keptPts} pts): medio ${t.meanAbs.toFixed(0)}° · curv.total ${t.totalCurv.toFixed(0)}° · >45°: ${t.sharp} · reversales>90°: ${t.reversals}`);
  console.log(`  huecos>8s: ${gp.length} (caminando ${gpWalk.length}, parada ${gp.length - gpWalk.length}) · saltos>12m: ${bigJumps.length}`);
  if (gpWalk.length) {
    console.log(`    ⚠ huecos CAMINANDO (filtro comió tramo): ` +
      gpWalk.slice(0, 12).map((g) => `seq${g.seq}:${g.dt}s/${g.dist.toFixed(0)}m`).join('  '));
  }
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map((a) => (path.isAbsolute(a) ? a : path.join(DIR, a)))
  : fs.readdirSync(DIR).filter((f) => /^prueba-.*\.csv$/.test(f)).map((f) => path.join(DIR, f));

for (const f of files) analyze(f);
