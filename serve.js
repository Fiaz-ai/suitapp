/* serve.js — zero-dependency static server for the Suit & Stitch app.
   Run:  node serve.js            (serves on http://localhost:8000)
         node serve.js 8080       (custom port)
   Also prints the LAN address so a phone on the same Wi-Fi can open it.
   Why: npx/npx.ps1 is blocked by the PowerShell execution policy on some
   Windows setups; plain `node` is not. No npm install needed. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function lanIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (name) {
    (ifaces[name] || []).forEach(function (iface) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    });
  });
  return out;
}

const server = http.createServer(function (req, res) {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/' || url === '') url = '/index.html';
  const file = path.normalize(path.join(ROOT, url));

  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found: ' + url); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('');
  console.log('  IIK is running:');
  console.log('    On this computer:  http://localhost:' + PORT);
  lanIPs().forEach(function (ip) {
    console.log('    On your Wi-Fi:    http://' + ip + ':' + PORT + '   (open this on the phone)');
  });
  console.log('');
  console.log('  Press Ctrl+C to stop.');
});
