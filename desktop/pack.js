/*
 * "Pack the screenshots for Claude" (DEVLOG #68): the owner can send at most 5 pictures and 30 MB per message, and the
 * collected screenshots are full-size PNGs (3-5 MB each). This packs the newest ones, made smaller (JPEG, 1600 px
 * wide) with their notes (.json), into ONE zip file of at most ~25 MB, saved on the Desktop.
 *
 *   zip(entries)                     -> Buffer   entries: [{ name, data: Buffer }] (stored, no compression: JPEGs
 *                                                 don't get smaller; plain zip that Windows opens by itself)
 *   pick(dirs, { max })              -> [{ png, json, at }] the newest pictures in those folders, newest first
 *   pack({ dirs, out, shrink, max, maxBytes }) -> { file, pictures, bytes }
 *       shrink(pngPath) -> Buffer (JPEG); given by main.js (Electron's nativeImage), so this file stays testable
 * Only reads the app's own screenshot folders; nothing is sent anywhere.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = e.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(0, 10); // time/date (not needed)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt32LE(0, 12);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + data.length;
  }
  const cdir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdir, end]);
}

/** The newest pictures (.png with their .json next to them) in these folders, newest first. */
function pick(dirs, { max = 60 } = {}) {
  const out = [];
  for (const d of dirs) {
    let names = [];
    try {
      names = fs.readdirSync(d);
    } catch (_) {
      continue;
    }
    for (const n of names) {
      if (!n.endsWith('.png')) continue;
      const png = path.join(d, n);
      const json = png.replace(/\.png$/, '.json');
      let at = 0;
      try {
        at = fs.statSync(png).mtimeMs;
      } catch (_) {
        continue;
      }
      out.push({ png, json: fs.existsSync(json) ? json : null, at });
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, max);
}

function pack({ dirs, out, shrink, max = 60, maxBytes = 25 * 1024 * 1024 }) {
  const entries = [];
  let bytes = 0;
  let pictures = 0;
  for (const p of pick(dirs, { max })) {
    let jpg;
    try {
      jpg = shrink(p.png);
    } catch (_) {
      continue;
    }
    const notes = p.json ? fs.readFileSync(p.json) : null;
    const add = jpg.length + (notes ? notes.length : 0) + 200;
    if (bytes + add > maxBytes) break;
    const base = `${path.basename(path.dirname(p.png))}-${path.basename(p.png, '.png')}`;
    entries.push({ name: `${base}.jpg`, data: jpg });
    if (notes) entries.push({ name: `${base}.json`, data: notes });
    bytes += add;
    pictures++;
  }
  if (!pictures) return { file: null, pictures: 0, bytes: 0 };
  const buf = zip(entries);
  fs.writeFileSync(out, buf);
  return { file: out, pictures, bytes: buf.length };
}

module.exports = { zip, crc32, pick, pack };
