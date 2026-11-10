#!/usr/bin/env node
"use strict";

/* Packages the browser extension: copies extension/ plus the shared core,
   word lists and Czech strings into dist/fortipass-extension/ and zips it
   for the Chrome Web Store, Firefox Add-ons and Edge Add-ons.

     npm run build:extension

   Load dist/fortipass-extension/ as an unpacked extension to try it. The zip
   is written here rather than by a `zip` binary, so the build works the same
   on Windows, and it is reproducible: entries are sorted, timestamps fixed
   and hidden files (.DS_Store …) left out. */

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "extension");
const DIST = path.join(ROOT, "dist");
const SHARED = ["core.js", "wordlist-en.js", "wordlist-cs.js", "locale-cs.js", "LICENSE"];

const visible = (name) => !name.startsWith(".");

/** Relative paths ("icons/icon-16.png") of the visible files under `dir`, sorted. */
function listFiles(dir, prefix = "") {
  return fs
    .readdirSync(path.join(dir, prefix), { withFileTypes: true })
    .filter((entry) => visible(entry.name))
    .flatMap((entry) => {
      const name = prefix ? prefix + "/" + entry.name : entry.name;
      if (entry.isDirectory()) return listFiles(dir, name);
      return entry.isFile() ? [name] : [];
    })
    .sort();
}

// zlib.crc32 only arrived in Node 22.2; this keeps the build on Node 18.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00:00, the earliest MS-DOS timestamp, for every entry.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
const UTF8_NAMES = 0x0800;
const UNIX_FILE = (0o100644 << 16) >>> 0;

/** A ZIP archive (deflate, or store where deflate does not help) of `dir`. */
function zipDirectory(dir) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const name of listFiles(dir)) {
    const data = fs.readFileSync(path.join(dir, name));
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const fileName = Buffer.from(name, "utf8");
    const crc = crc32(data);
    if (offset + 30 + fileName.length + body.length > 0xffffffff) throw new Error("archive too large for ZIP32");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    // extra field, comment, disk number and internal attributes stay 0
    central.writeUInt32LE(UNIX_FILE, 38); // -rw-r--r--
    central.writeUInt32LE(offset, 42);

    locals.push(local, fileName, body);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + body.length;
  }

  const entries = centrals.length / 2;
  if (entries > 0xffff) throw new Error("too many files for ZIP32");
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries, 8);
  end.writeUInt16LE(entries, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat(directory, end));
}

/** Builds the unpacked extension and its zip under `dist`. */
function build(dist = DIST) {
  const out = path.join(dist, "fortipass-extension");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(SOURCE, out, { recursive: true, filter: (src) => src === SOURCE || visible(path.basename(src)) });
  SHARED.forEach((file) => fs.copyFileSync(path.join(ROOT, file), path.join(out, file)));

  const { version } = JSON.parse(fs.readFileSync(path.join(SOURCE, "manifest.json"), "utf8"));
  const zip = path.join(dist, `fortipass-extension-${version}.zip`);
  // Write beside the old zip and swap, so a failed build never leaves it
  // missing or half-written.
  const temp = `${zip}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, zipDirectory(out));
    fs.renameSync(temp, zip);
  } finally {
    fs.rmSync(temp, { force: true });
  }
  return { dir: out, zip };
}

if (require.main === module) {
  const { dir, zip } = build();
  console.log(`Built ${path.relative(ROOT, dir)}/ and ${path.relative(ROOT, zip)}`);
}

module.exports = { build, zipDirectory, listFiles, crc32 };
