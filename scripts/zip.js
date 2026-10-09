/* npm run zip: packs manifest.json, icons/ and src/ into xrnsocial.zip, the
 * file the Chrome Web Store and addons.mozilla.org take.
 *
 * Plain Node with no dependencies, so it works the same on Windows, Linux and
 * macOS without a zip tool installed. Entry names always use forward slashes:
 * the stores reject archives whose paths use Windows backslashes, which is
 * what PowerShell's Compress-Archive has been known to write. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = 'xrnsocial.zip';
const INCLUDE = ['manifest.json', 'icons', 'src'];
const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

function walk(rel) {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isFile()) return [rel];
  return fs.readdirSync(abs).sort()
    .filter(name => !JUNK.has(name))
    .flatMap(name => walk(path.join(rel, name)));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* Zip headers only hold MS-DOS dates: two-second steps, local time. */
function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

const parts = [];
const central = [];
let offset = 0;
const files = INCLUDE.flatMap(walk);

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  const name = Buffer.from(rel.split(path.sep).join('/'), 'utf8');
  const data = fs.readFileSync(abs);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const stored = deflated.length >= data.length;   // tiny or already compressed
  const body = stored ? data : deflated;
  const method = stored ? 0 : 8;
  const crc = crc32(data);
  const { time, date } = dosDateTime(fs.statSync(abs).mtime);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);         // version needed: 2.0
  local.writeUInt16LE(0x0800, 6);     // names are UTF-8
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  parts.push(local, name, body);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);         // made by: 2.0, MS-DOS attributes
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(method, 10);
  entry.writeUInt16LE(time, 12);
  entry.writeUInt16LE(date, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(body.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);

  offset += local.length + name.length + body.length;
}

const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);

const zip = Buffer.concat(parts.concat(directory, end));
fs.writeFileSync(path.join(ROOT, OUT), zip);
console.log(OUT + ': ' + files.length + ' files, ' + Math.round(zip.length / 1024) + ' KB');
