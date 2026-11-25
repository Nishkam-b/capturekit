#!/usr/bin/env node
/**
 * Packages the cursor extension for download, with no dependencies:
 *  1. draws the toolbar icons (PNG) into extension/icons/
 *  2. zips extension/ into public/capturekit-extension.zip (served by the site)
 *
 * The same zip is what you upload to the Chrome Web Store / Edge Add-ons.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const extDir = path.join(root, "extension");
const outDir = path.join(root, "public");

// ------------------------------------------------------------------ CRC-32
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------------ PNG icons
function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** CaptureKit mark: green rounded square, white ring, white dot (4× supersampled). */
function drawIcon(size) {
  const ss = 4;
  const out = Buffer.alloc(size * size * 4);
  const green = [16, 185, 129];
  const r = size * 0.22; // corner radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0;
      let white = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          // rounded square
          const qx = Math.max(Math.abs(px - size / 2) - (size / 2 - r), 0);
          const qy = Math.max(Math.abs(py - size / 2) - (size / 2 - r), 0);
          if (Math.hypot(qx, qy) > r) continue;
          cover++;
          const d = Math.hypot(px - size / 2, py - size / 2);
          const ring = d > size * 0.27 && d < size * 0.36;
          const dot = d < size * 0.15;
          if (ring || dot) white++;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      const w = cover ? white / cover : 0;
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(green[c] * (1 - w) + 255 * w);
      out[i + 3] = Math.round((cover / n) * 255);
    }
  }
  return png(size, out);
}

fs.mkdirSync(path.join(extDir, "icons"), { recursive: true });
for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(extDir, "icons", `icon-${s}.png`), drawIcon(s));

// ------------------------------------------------------------------ ZIP (deflate)
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const dosTime = 0; // 00:00:00
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1; // fixed date: reproducible zips
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const files = [];
(function walk(dir, prefix) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, `${prefix}${e.name}/`);
    else files.push({ name: `capturekit-extension/${prefix}${e.name}`, data: fs.readFileSync(full) });
  }
})(extDir, "");

fs.mkdirSync(outDir, { recursive: true });
const zipped = zip(files);
fs.writeFileSync(path.join(outDir, "capturekit-extension.zip"), zipped);
const version = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8")).version;
console.log(`extension ${version}: ${files.length} files, ${(zipped.length / 1024).toFixed(1)} KB -> public/capturekit-extension.zip`);
