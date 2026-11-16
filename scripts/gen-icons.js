/* scripts/gen-icons.js — generates icons/icon-192.png and icon-512.png.
   Pure Node (zlib only), no dependencies. Run: node scripts/gen-icons.js */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- drawing (normalized 0..1) ----------
function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r || (x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r);
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}
function circleHit(x, y, cx, cy, r) { return Math.hypot(x - cx, y - cy) <= r; }

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const bg = [0x14, 0x53, 0x2d];        // deep emerald
  const white = [0xff, 0xff, 0xff];
  const amber = [0xb4, 0x53, 0x09];     // thread
  const hole = [0x14, 0x53, 0x2d];
  const r = 0.18 * size;                 // corner radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size, ny = y / size;
      let col = [0, 0, 0], a = 0;
      if (inRoundedRect(nx, ny, 0, 0, 1, 1, r / size)) {
        col = bg; a = 255;
        // needle (diagonal)
        if (segDist(nx, ny, 0.30, 0.70, 0.72, 0.28) < 0.022) { col = white; }
        // needle eye
        if (circleHit(nx, ny, 0.30, 0.70, 0.035)) { col = bg; }
        // thread arc (amber) around button
        if (Math.abs(Math.hypot(nx - 0.52, ny - 0.55) - 0.20) < 0.012) { col = amber; }
        // button: ring + holes
        if (Math.abs(Math.hypot(nx - 0.52, ny - 0.55) - 0.115) < 0.045) { col = white; }
        if (circleHit(nx, ny, 0.52, 0.55, 0.045)) { col = bg; }
        if (circleHit(nx, ny, 0.48, 0.51, 0.018) || circleHit(nx, ny, 0.56, 0.51, 0.018) ||
            circleHit(nx, ny, 0.48, 0.59, 0.018) || circleHit(nx, ny, 0.56, 0.59, 0.018)) { col = hole; }
      }
      const i = (y * size + x) * 4;
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = a;
    }
  }
  return encodePNG(size, size, buf);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), draw(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), draw(512));
console.log('Wrote icons/icon-192.png and icons/icon-512.png');
