"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { build, zipDirectory, listFiles, crc32 } = require("../build/extension.js");

const dir = path.join(__dirname, "..", "extension");
const read = (file) => fs.readFileSync(path.join(dir, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const locales = fs.readdirSync(path.join(dir, "_locales"));
const popupHtml = read("popup.html");

/** Every opening tag of `html` as { tag, attrs }. */
function tags(html) {
  return Array.from(html.matchAll(/<([a-z]+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*\/?>/g), (m) => ({
    tag: m[1],
    attrs: Object.fromEntries(Array.from(m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g), (a) => [a[1], a[2] === undefined ? "" : a[2]])),
  }));
}

/** Entries of a ZIP archive, read through its central directory. */
function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, "end of central directory");
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(at), 0x02014b50, "central directory header");
    const method = buffer.readUInt16LE(at + 10);
    const crc = buffer.readUInt32LE(at + 16);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const offset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;

    assert.equal(buffer.readUInt32LE(offset), 0x04034b50, `local header of ${name}`);
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const body = buffer.subarray(start, start + size);
    assert.ok(method === 0 || method === 8, `${name}: method ${method}`);
    entries.push({ name, crc, data: method === 8 ? zlib.inflateRawSync(body) : body });
  }
  return entries;
}

test("the extension asks for no permissions and no network", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, []);
  assert.equal(manifest.host_permissions, undefined);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
});

test("Firefox: an add-on ID and the data-collection declaration AMO requires", () => {
  const gecko = manifest.browser_specific_settings.gecko;
  assert.match(gecko.id, /^[\w.-]+@[\w.-]+$/);
  assert.deepEqual(gecko.data_collection_permissions, { required: ["none"] });
  // data_collection_permissions is understood from Firefox 140.
  assert.ok(parseFloat(gecko.strict_min_version) >= 140, gecko.strict_min_version);
});

test("every icon the manifest names exists", () => {
  const icons = Object.values(manifest.icons).concat(Object.values(manifest.action.default_icon));
  icons.forEach((icon) => assert.ok(fs.existsSync(path.join(dir, icon)), icon));
});

test("every locale has every message the popup and manifest use", () => {
  const used = new Set();
  tags(popupHtml).forEach(({ attrs }) => {
    if (attrs["data-i18n"]) used.add(attrs["data-i18n"]);
    if (attrs["data-i18n-label"]) used.add(attrs["data-i18n-label"]);
  });
  Array.from(read("popup.js").matchAll(/\b(?:t|copyFeedback)\("(\w+)"/g), (m) => used.add(m[1]));
  Array.from(JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g), (m) => used.add(m[1]));
  ["copied", "copyFailed", "crackedInstantly", "toCrack", "modes"].forEach((key) => assert.ok(used.has(key), key));
  assert.ok(locales.includes(manifest.default_locale));
  for (const locale of locales) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    used.forEach((key) => assert.ok(messages[key], `${locale} lacks ${key}`));
  }
});

test("the popup's limits and defaults match the website's", () => {
  const ranges = Object.fromEntries(
    tags(popupHtml)
      .filter(({ attrs }) => attrs.type === "range")
      .map(({ attrs }) => [attrs.id, [Number(attrs.min), Number(attrs.max), Number(attrs.value)]])
  );
  // The website: length 4–128 (slider to 64), default 16; words 3–12, default 6; PIN 3–16, default 6.
  assert.deepEqual(ranges, { length: [4, 64, 16], words: [3, 12, 6], pin: [3, 16, 6] });
});

test("the popup declares its language and wires the mode tabs to their panels", () => {
  const all = tags(popupHtml);
  assert.ok(all.find(({ tag }) => tag === "html").attrs.lang, "<html lang>");
  const tablist = all.find(({ attrs }) => attrs.role === "tablist");
  assert.ok(tablist.attrs["data-i18n-label"] || tablist.attrs["aria-label"], "tablist label");
  const tabs = all.filter(({ attrs }) => attrs.role === "tab");
  const panels = new Map(all.filter(({ attrs }) => attrs.role === "tabpanel").map(({ attrs }) => [attrs.id, attrs]));
  assert.equal(tabs.length, 3);
  assert.equal(panels.size, 3);
  tabs.forEach(({ attrs }) => {
    const panel = panels.get(attrs["aria-controls"]);
    assert.ok(panel, `${attrs.id} controls a tabpanel`);
    assert.equal(panel["aria-labelledby"], attrs.id);
  });
});

test("the popup loads the shared scripts the packager copies in", () => {
  const packager = fs.readFileSync(path.join(__dirname, "..", "build", "extension.js"), "utf8");
  Array.from(popupHtml.matchAll(/<script src="([^"]+)"/g), (m) => m[1])
    .filter((src) => src !== "popup.js")
    .forEach((src) => assert.ok(packager.includes(`"${src}"`), src + " is not copied into the package"));
});

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  if (zlib.crc32) assert.equal(crc32(Buffer.from(popupHtml)), zlib.crc32(Buffer.from(popupHtml)));
});

test("the packaged zip holds exactly the built folder, byte for byte", (t) => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "fortipass-zip-"));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  const { dir: built, zip } = build(dist);
  assert.equal(path.basename(zip), `fortipass-extension-${manifest.version}.zip`);
  assert.deepEqual(fs.readdirSync(dist).sort(), [path.basename(built), path.basename(zip)].sort());

  const archive = fs.readFileSync(zip);
  const entries = unzip(archive);
  const files = listFiles(built);
  assert.deepEqual(entries.map((entry) => entry.name), files);
  ["manifest.json", "popup.html", "popup.js", "core.js", "locale-cs.js", "wordlist-en.js", "wordlist-cs.js", "_locales/en/messages.json"]
    .forEach((name) => assert.ok(files.includes(name), name));
  for (const entry of entries) {
    const original = fs.readFileSync(path.join(built, entry.name));
    assert.ok(entry.data.equals(original), `${entry.name} differs`);
    assert.equal(entry.crc, crc32(original), `${entry.name} CRC`);
  }

  // Reproducible: a second build gives the same bytes.
  assert.ok(fs.readFileSync(build(dist).zip).equals(archive));
});

test("a failed packaging run leaves the previous zip in place", (t) => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "fortipass-zip-"));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  const { zip } = build(dist);
  const before = fs.readFileSync(zip);
  // Block the temporary file the packager writes before swapping it in.
  fs.mkdirSync(`${zip}.${process.pid}.tmp`);
  assert.throws(() => build(dist));
  assert.ok(fs.readFileSync(zip).equals(before));
});

test("the zip leaves out hidden files and folders", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fortipass-zip-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, "icons"));
  fs.mkdirSync(path.join(tmp, ".git"));
  fs.writeFileSync(path.join(tmp, "a.txt"), "aaaa".repeat(100));
  fs.writeFileSync(path.join(tmp, "icons", "b.bin"), Buffer.from([1, 2, 3]));
  fs.writeFileSync(path.join(tmp, ".DS_Store"), "x");
  fs.writeFileSync(path.join(tmp, "icons", ".DS_Store"), "x");
  fs.writeFileSync(path.join(tmp, ".git", "HEAD"), "x");
  const entries = unzip(zipDirectory(tmp));
  assert.deepEqual(entries.map((entry) => entry.name), ["a.txt", "icons/b.bin"]);
  assert.equal(entries[0].data.toString(), "aaaa".repeat(100));
  assert.deepEqual(Array.from(entries[1].data), [1, 2, 3]);
});
