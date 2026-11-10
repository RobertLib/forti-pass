#!/usr/bin/env node
"use strict";

/* Packages the browser extension: copies extension/ plus the shared core,
   word lists and Czech strings into dist/fortipass-extension/ and zips it
   for the Chrome Web Store, Firefox Add-ons and Edge Add-ons.

     npm run build:extension

   Load dist/fortipass-extension/ as an unpacked extension to try it. */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "extension");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "fortipass-extension");
const SHARED = ["core.js", "wordlist-en.js", "wordlist-cs.js", "locale-cs.js", "LICENSE"];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(SOURCE, OUT, { recursive: true });
SHARED.forEach((file) => fs.copyFileSync(path.join(ROOT, file), path.join(OUT, file)));

const { version } = JSON.parse(fs.readFileSync(path.join(SOURCE, "manifest.json"), "utf8"));
const zip = path.join(DIST, `fortipass-extension-${version}.zip`);
fs.rmSync(zip, { force: true });
execFileSync("zip", ["-r", "-X", "-q", zip, "."], { cwd: OUT });
console.log(`Built ${path.relative(ROOT, OUT)}/ and ${path.relative(ROOT, zip)}`);
