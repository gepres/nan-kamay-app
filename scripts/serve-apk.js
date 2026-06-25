/**
 * Sirve el APK release por HTTP en la red local para instalarlo en el teléfono
 * sin cable (descarga desde el navegador). Soporta Range (descargas grandes
 * reanudables) y registra cada petición para ver cuándo el teléfono baja.
 *
 *   node scripts/serve-apk.js
 * Luego en el teléfono (misma Wi-Fi): http://<IP-PC>:8000/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const APK = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const PORT = 8000;

if (!fs.existsSync(APK)) {
  console.error('No existe el APK:', APK);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const total = fs.statSync(APK).size;
  const base = {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': 'attachment; filename="nan-kamay.apk"',
    'Accept-Ranges': 'bytes',
  };
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ← ${req.socket.remoteAddress} range=${req.headers.range || '-'}`);

  if (req.method === 'HEAD') {
    res.writeHead(200, { ...base, 'Content-Length': total });
    return res.end();
  }
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : total - 1;
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(APK, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...base, 'Content-Length': total });
    fs.createReadStream(APK).pipe(res);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`APK server en http://0.0.0.0:${PORT}/  (${(fs.statSync(APK).size / 1048576).toFixed(0)} MB)`);
  console.log('Ctrl+C para detener cuando termines de instalar.');
});
