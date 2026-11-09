"use strict";

// Guards against the easy-to-forget parts of shipping a static PWA.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const sw = read("sw.js");

function pngSize(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", file + " is not a PNG");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test("index.html asks for exactly the asset version the service worker caches", () => {
  const version = /const ASSET_VERSION = "([^"]+)"/.exec(sw)[1];
  const files = ["styles.css", "wordlist.js", "core.js", "script.js"];
  for (const file of files) {
    assert.ok(
      html.includes(file + "?v=" + version),
      `${file} in index.html must use ?v=${version} — bump both together`
    );
  }
  const versions = new Set(Array.from(html.matchAll(/\?v=([^"']+)/g), (m) => m[1]));
  assert.deepEqual(Array.from(versions), [version]);
});

test("every file the service worker pre-caches exists", () => {
  const list = /const SHELL = \[([\s\S]*?)\];/.exec(sw)[1];
  const files = Array.from(list.matchAll(/"([^"]+)"/g), (m) => m[1]).filter(
    (file) => file !== "./"
  );
  files.forEach((file) => assert.ok(fs.existsSync(path.join(root, file)), file));
});

test("the CSP hash matches the inline theme script", () => {
  const inline = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const hash = crypto.createHash("sha256").update(inline, "utf8").digest("base64");
  assert.ok(
    html.includes("'sha256-" + hash + "'"),
    "Update the CSP in index.html to 'sha256-" + hash + "'"
  );
  assert.equal((html.match(/<script>/g) || []).length, 1, "only one inline script is allowed");
});

test("structured data is valid JSON", () => {
  const blocks = Array.from(
    html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    (m) => m[1]
  );
  assert.ok(blocks.length >= 1);
  blocks.forEach((block) => JSON.parse(block));
});

test("manifest icons exist with the declared sizes", () => {
  const manifest = JSON.parse(read("manifest.json"));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src);
    if (icon.type === "image/png") {
      const [w, h] = pngSize(icon.src);
      assert.equal(`${w}x${h}`, icon.sizes, icon.src);
    }
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});

test("the social preview image is 1200×630", () => {
  assert.deepEqual(pngSize("og-image.png"), [1200, 630]);
  assert.ok(html.includes('content="https://robertlib.github.io/forti-pass/og-image.png"'));
});
