"use strict";

// Guards against the easy-to-forget parts of shipping a static, multilingual
// PWA: stale generated files, broken links, mismatched hreflang pairs,
// missing cache entries and element ids the script expects.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const site = require("../build/site.js");
const { renderSite, VERSIONED_ASSETS, STATIC_ASSETS } = require("../build/build.js");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const script = read("script.js");
const sw = read("sw.js");

const PAGES = [];
site.PAGES.forEach((page) =>
  site.LANGUAGES.forEach((lang) =>
    PAGES.push({ page, lang, file: page.paths[lang] + "index.html", html: read(page.paths[lang] + "index.html") })
  )
);

function pngSize(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", file + " is not a PNG");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

/** Resolves a relative link from a page to a file in the repository. */
function resolve(fromFile, href) {
  const clean = href.split("#")[0].split("?")[0];
  if (!clean) return fromFile;
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean));
  return clean.endsWith("/") || target === "." ? path.posix.join(target, "index.html") : target;
}

const attr = (html, re) => Array.from(html.matchAll(re), (m) => m[1]);

test("every generated file matches its sources (run `npm run build`)", () => {
  const stale = [];
  renderSite().forEach((contents, file) => {
    if (!exists(file) || read(file) !== contents) stale.push(file);
  });
  assert.deepEqual(stale, [], "out of date: " + stale.join(", "));
});

test("pages ask for exactly the asset version the service worker caches", () => {
  const version = /const ASSET_VERSION = "([^"]+)"/.exec(sw)[1];
  assert.equal(version, site.ASSET_VERSION);
  for (const { file, html } of PAGES) {
    const versions = new Set(attr(html, /\?v=([^"']+)/g));
    assert.deepEqual(Array.from(versions), [version], file);
  }
});

test("the service worker pre-caches files that exist, and every page", () => {
  VERSIONED_ASSETS.concat(STATIC_ASSETS).forEach((file) => assert.ok(exists(file), file));
  for (const { page, lang } of PAGES) {
    assert.ok(sw.includes(`"${page.paths[lang]}"`), "sw.js must pre-cache " + page.paths[lang]);
  }
  // Every script or stylesheet a page loads is pre-cached, or offline breaks.
  for (const { file, html } of PAGES) {
    attr(html, /(?:src|href)="([^"]+\?v=[^"]+)"/g).forEach((ref) => {
      const asset = resolve(file, ref);
      assert.ok(VERSIONED_ASSETS.includes(asset), `${file} loads ${asset}, which sw.js does not cache`);
    });
  }
});

test("the CSP hash matches the one inline script on every page", () => {
  for (const { file, html } of PAGES) {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
    const hash = crypto.createHash("sha256").update(inline, "utf8").digest("base64");
    assert.ok(html.includes("'sha256-" + hash + "'"), file);
    assert.equal((html.match(/<script>/g) || []).length, 1, file + ": only one inline script");
    assert.ok(html.includes("connect-src 'none'"), file);
  }
});

test("structured data is valid JSON with the page's language", () => {
  for (const { file, html, lang } of PAGES) {
    const blocks = attr(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    assert.ok(blocks.length >= 1, file);
    blocks.forEach((block) => assert.equal(JSON.parse(block).inLanguage, lang, file));
  }
});

test("canonical and hreflang links are absolute and reciprocal", () => {
  for (const { page, lang, file, html } of PAGES) {
    assert.match(html, new RegExp(`<html lang="${lang}"`), file);
    assert.ok(html.includes(`<link rel="canonical" href="${site.SITE_URL}${page.paths[lang]}" />`), file);
    for (const code of site.LANGUAGES) {
      const href = site.SITE_URL + page.paths[code];
      assert.ok(html.includes(`hreflang="${code}" href="${href}"`), `${file} → ${code}`);
      // The other language's page points back here.
      const other = read(page.paths[code] + "index.html");
      assert.ok(other.includes(`hreflang="${lang}" href="${site.SITE_URL}${page.paths[lang]}"`), `${code} → ${file}`);
    }
    assert.ok(html.includes(`hreflang="x-default" href="${site.SITE_URL}${page.paths.en}"`), file);
  }
});

test("every relative link and asset on every page exists", () => {
  for (const { file, html } of PAGES) {
    attr(html, /(?:href|src)="([^"]+)"/g)
      .filter((ref) => !/^(https?:|mailto:|#|data:)/.test(ref))
      .forEach((ref) => assert.ok(exists(resolve(file, ref)), `${file}: ${ref}`));
  }
});

test("titles and descriptions are unique and a sensible length", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const { file, html } of PAGES) {
    const title = /<title>([^<]+)<\/title>/.exec(html)[1];
    const description = /<meta name="description" content="([^"]+)"/.exec(html)[1];
    assert.ok(!titles.has(title), "duplicate title: " + title);
    assert.ok(!descriptions.has(description), "duplicate description on " + file);
    titles.add(title);
    descriptions.add(description);
    assert.ok(title.length <= 75, `${file}: title is ${title.length} characters`);
    assert.ok(description.length >= 90 && description.length <= 200, `${file}: description is ${description.length}`);
    assert.equal((html.match(/<h1>/g) || []).length, 1, file + ": exactly one h1");
  }
});

test("the sitemap lists every page with its alternates", () => {
  const xml = read("sitemap.xml");
  for (const { page, lang } of PAGES) {
    assert.ok(xml.includes(`<loc>${site.SITE_URL}${page.paths[lang]}</loc>`), page.paths[lang]);
  }
  assert.equal((xml.match(/<url>/g) || []).length, PAGES.length);
  assert.ok(read("robots.txt").includes(`Sitemap: ${site.SITE_URL}sitemap.xml`));
});

// Which ids each kind of page must carry. A generator page holds only its
// own mode's controls; the Czech passphrase page adds the word-list choice.
const ID_GROUPS = {
  everywhere: ["themeBtn", "shortcutsBtn", "shortcutsDialog", "closeDialogBtn", "copyDialog", "copyDialogText", "closeCopyDialogBtn", "toasts"],
  generator: ["generator", "heroPassword", "maskBtn", "refreshBtn", "copyBtn", "downloadBtn", "clearClipboard", "meter", "meterTrack", "liveStatus", "passwordList", "count", "countDown", "countUp", "historyCard", "historyCount", "historyList", "clearHistoryBtn"],
  password: ["lengthRange", "length", "uppercase", "lowercase", "numbers", "symbols", "requireEach", "excludeAmbiguous", "noRepeats", "excludeChars", "advanced", "presets"],
  passphrase: ["wordCount", "wordCountValue", "wordBits", "separator", "capitalize", "addNumber", "addSymbol"],
  passphraseCs: ["wordLanguage", "asciiOnly"],
  pin: ["pinLength", "pinLengthValue", "presets"],
  checker: ["checkInput", "checkRevealBtn", "checkMeter", "checkMeterTrack", "checkFindings"],
  wifi: ["wifi", "wifiSsid", "wifiSecurity", "wifiHidden", "wifiStyle", "wifiPassword", "wifiPasswordField", "wifiNewBtn", "wifiCopyBtn", "wifiMeter", "wifiMeterTrack", "wifiHint", "wifiQr", "wifiQrPath", "wifiQrEmpty", "wifiPrintBtn", "wifiSaveBtn", "wifiPrintSsid", "wifiPrintPassword", "wifiPrintPasswordRow"],
};

function groupsFor(page, lang) {
  const groups = ["everywhere"];
  if (page.type === "generator") {
    groups.push("generator", page.mode);
    if (page.mode === "passphrase" && lang === "cs") groups.push("passphraseCs");
  } else if (page.type === "checker" || page.type === "wifi") {
    groups.push(page.type);
  }
  return groups;
}

test("every element id script.js asks for exists on the pages that need it", () => {
  const wanted = new Set(attr(script, /\$\("#([\w-]+)"\)/g));
  const known = new Set(Object.values(ID_GROUPS).flat());
  // An id the script asks for but no group lists is a typo or a stale lookup.
  wanted.forEach((id) => assert.ok(known.has(id), `script.js asks for #${id}, which no page type lists`));
  known.forEach((id) => assert.ok(wanted.has(id), `#${id} is listed but script.js never asks for it`));

  for (const { page, lang, file, html } of PAGES) {
    const ids = new Set(attr(html, /\sid="([^"]+)"/g));
    groupsFor(page, lang).forEach((group) =>
      ID_GROUPS[group].forEach((id) => assert.ok(ids.has(id), `${file} lacks #${id} (${group})`))
    );
  }
});

test("generator pages link their modes to each other and mark their own", () => {
  const generators = PAGES.filter(({ page }) => page.type === "generator");
  for (const { page, lang, file, html } of generators) {
    const links = attr(html, /<a class="segment" href="([^"]+)" data-mode=/g);
    assert.equal(links.length, 3, file);
    links.forEach((href) => assert.ok(exists(resolve(file, href)), `${file}: ${href}`));
    assert.ok(html.includes(`data-mode="${page.mode}" aria-current="page"`), file);
    assert.ok(html.includes(`id="generator" data-mode="${page.mode}"`), file);
    // Only this mode's controls are on the page.
    const others = ["password", "passphrase", "pin"].filter((mode) => mode !== page.mode);
    others.forEach((mode) =>
      ID_GROUPS[mode]
        .filter((id) => !ID_GROUPS[page.mode].includes(id))
        .forEach((id) => assert.ok(!html.includes(`id="${id}"`), `${file} carries #${id} of ${mode}`))
    );
    assert.equal(lang === "cs" && page.mode === "passphrase", html.includes('id="wordLanguage"'), file);
  }
});

test("the main navigation lights the page's section", () => {
  for (const { page, file, html } of PAGES) {
    const nav = /<nav class="app-nav"[\s\S]*?<\/nav>/.exec(html)[0];
    const current = nav.match(/aria-current="(page|true)"/g) || [];
    assert.equal(current.length, page.section ? 1 : 0, file);
  }
});

test("Czech pages load the Czech words and strings; English pages do not", () => {
  for (const { file, html, lang } of PAGES) {
    if (/data-page="article"/.test(html)) continue;
    // The checker recognises Czech words whatever the page language.
    const checkerPage = /data-page="checker"/.test(html);
    assert.equal(html.includes("wordlist-cs.js"), lang === "cs" || checkerPage, file);
    assert.equal(html.includes("locale-cs.js"), lang === "cs", file);
  }
});

test("manifests point at existing icons and pages", () => {
  for (const file of ["manifest.json", "cs/manifest.json"]) {
    const manifest = JSON.parse(read(file));
    const dir = path.posix.dirname(file);
    for (const icon of manifest.icons) {
      const src = path.posix.normalize(path.posix.join(dir, icon.src));
      assert.ok(exists(src), src);
      if (icon.type === "image/png") {
        const [w, h] = pngSize(src);
        assert.equal(`${w}x${h}`, icon.sizes, src);
      }
    }
    assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
    manifest.shortcuts.forEach((shortcut) =>
      assert.ok(exists(resolve(file, shortcut.url)), `${file}: ${shortcut.url}`)
    );
  }
});

test("the social preview images are 1200×630", () => {
  assert.deepEqual(pngSize("og-image.png"), [1200, 630]);
  assert.deepEqual(pngSize("og-image-cs.png"), [1200, 630]);
  for (const { file, html, lang } of PAGES) {
    const image = lang === "cs" ? "og-image-cs.png" : "og-image.png";
    assert.ok(html.includes(`content="${site.SITE_URL}${image}"`), file);
  }
});
