"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..", "extension");
const read = (file) => fs.readFileSync(path.join(dir, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const locales = fs.readdirSync(path.join(dir, "_locales"));

test("the extension asks for no permissions and no network", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, []);
  assert.equal(manifest.host_permissions, undefined);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
});

test("every icon the manifest names exists", () => {
  Object.values(manifest.icons).forEach((icon) => assert.ok(fs.existsSync(path.join(dir, icon)), icon));
});

test("every locale has every message the popup and manifest use", () => {
  const used = new Set(Array.from(read("popup.html").matchAll(/data-i18n="(\w+)"/g), (m) => m[1]));
  Array.from(read("popup.js").matchAll(/\bt\("(\w+)"/g), (m) => used.add(m[1]));
  Array.from(JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g), (m) => used.add(m[1]));
  assert.ok(locales.includes(manifest.default_locale));
  for (const locale of locales) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    used.forEach((key) => assert.ok(messages[key], `${locale} lacks ${key}`));
  }
});

test("the popup loads the shared scripts the packager copies in", () => {
  const packager = fs.readFileSync(path.join(__dirname, "..", "build", "extension.js"), "utf8");
  Array.from(read("popup.html").matchAll(/<script src="([^"]+)"/g), (m) => m[1])
    .filter((src) => src !== "popup.js")
    .forEach((src) => assert.ok(packager.includes(`"${src}"`), src + " is not copied into the package"));
});
