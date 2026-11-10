"use strict";

// Drives the real pages in headless Chromium: what script.js does when you
// click, type and press keys. Skips (rather than fails) when no browser is
// installed — see tests/helpers/chrome.js for how one is found.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const chrome = require("./helpers/chrome");
const site = require("../build/site.js");

const ROOT = path.join(__dirname, "..");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

// Served under the same path as on GitHub Pages, so the 404 page's absolute
// links resolve.
const PREFIX = new URL(site.SITE_URL).pathname;

/** Serves the repository like GitHub Pages: folders give index.html. */
function serve() {
  const server = http.createServer((request, response) => {
    let file = decodeURIComponent(new URL(request.url, "http://x").pathname);
    file = file.startsWith(PREFIX) ? "/" + file.slice(PREFIX.length) : "/missing";
    if (file.endsWith("/")) file += "index.html";
    const full = path.join(ROOT, path.normalize(file));
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      response.writeHead(404, { "content-type": TYPES[".html"] });
      response.end(fs.readFileSync(path.join(ROOT, "404.html")));
      return;
    }
    response.writeHead(200, { "content-type": TYPES[path.extname(full)] || "application/octet-stream" });
    response.end(fs.readFileSync(full));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// A reason string skips every test; `false` (not null) runs them.
const skip = chrome.unavailable() || false;
let server;
let browser;
let base;

test.before(async () => {
  if (skip) return;
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}${PREFIX}`;
  browser = await chrome.launch();
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

/** Opens a page with fresh storage and checks it ran without errors. */
async function open(t, pagePath) {
  const page = await browser.open(base + pagePath);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  t.after(() => page.close());
  return page;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A key press with an explicit physical key, as the digit shortcuts need. */
async function pressCode(page, key, code) {
  for (const type of ["keyDown", "keyUp"]) {
    await page.send("Input.dispatchKeyEvent", Object.assign({ type, key, code }, type === "keyDown" ? { text: key } : {}));
  }
}

const hero = (page) => page.evaluate(() => document.getElementById("heroPassword").textContent);

test("every page loads without a script error", { skip }, async (t) => {
  const paths = [];
  site.PAGES.forEach((p) => site.LANGUAGES.forEach((lang) => paths.push(p.paths[lang])));
  paths.push("404.html");
  for (const pagePath of paths) {
    const page = await open(t, pagePath);
    await sleep(100);
    assert.deepEqual(page.errors, [], pagePath);
  }
});

test("the generator makes a password, regenerates and remembers its settings", { skip }, async (t) => {
  const page = await open(t, "");
  const first = await hero(page);
  assert.equal(first.length, 16);
  assert.match(first, /[A-Z]/);
  assert.match(first, /[a-z]/);
  assert.match(first, /[0-9]/);

  await page.evaluate(() => document.getElementById("refreshBtn").click());
  assert.notEqual(await hero(page), first);

  await page.evaluate(() => {
    const range = document.getElementById("lengthRange");
    range.value = "24";
    range.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal((await hero(page)).length, 24);
  const meter = await page.evaluate(() => {
    const track = document.getElementById("meterTrack");
    return {
      name: track.getAttribute("aria-label"),
      text: track.getAttribute("aria-valuetext"),
      bits: document.getElementById("entropyText").textContent,
    };
  });
  assert.deepEqual(meter, { name: "Password strength", text: "Excellent", bits: "156 bits" });

  // Settings survive a reload; generated values do not.
  await page.reload();
  assert.equal(await page.evaluate(() => document.getElementById("length").value), "24");
  assert.ok(!(await page.evaluate(() => localStorage.getItem("fortipass:settings:v1"))).includes(await hero(page)));
});

test("presets light up while they match and a list regenerates one row", { skip }, async (t) => {
  const page = await open(t, "");
  const chip = (preset) =>
    page.evaluate((name) => document.querySelector(`[data-preset="${name}"]`).getAttribute("aria-pressed"), preset);

  await page.evaluate(() => document.querySelector('[data-preset="paranoid"]').click());
  assert.equal((await hero(page)).length, 32);
  assert.equal(await chip("paranoid"), "true");
  await page.evaluate(() => document.getElementById("symbols").click());
  assert.equal(await chip("paranoid"), "false");

  await page.evaluate(() => {
    document.getElementById("countUp").click();
    document.getElementById("countUp").click();
  });
  const before = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#passwordList .row-text"), (row) => row.textContent)
  );
  assert.equal(before.length, 3);
  assert.equal(await page.evaluate(() => document.getElementById("downloadBtn").hidden), false);
  await page.evaluate(() => document.querySelector("#passwordList li:nth-child(2) .row-btn").click());
  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#passwordList .row-text"), (row) => row.textContent)
  );
  assert.equal(after[0], before[0]);
  assert.notEqual(after[1], before[1]);
  assert.equal(after[2], before[2]);
});

test("impossible options show an error instead of a password", { skip }, async (t) => {
  const page = await open(t, "");
  await page.evaluate(() => ["uppercase", "lowercase", "numbers", "symbols"].forEach((id) => document.getElementById(id).click()));
  const state = await page.evaluate(() => {
    const button = document.getElementById("heroPassword");
    return { disabled: button.disabled, error: button.classList.contains("is-error"), text: button.textContent };
  });
  assert.deepEqual(state, { disabled: true, error: true, text: "Select at least one character type." });

  // Nothing to copy or hide, and the character types are marked as the cause.
  const controls = await page.evaluate(() => ({
    copy: document.getElementById("copyBtn").disabled,
    hide: document.getElementById("maskBtn").disabled,
    marked: document.getElementById("uppercase").closest("fieldset").classList.contains("is-invalid"),
  }));
  assert.deepEqual(controls, { copy: true, hide: true, marked: true });

  await page.evaluate(() => document.getElementById("numbers").click());
  const fixed = await page.evaluate(() => ({
    copy: document.getElementById("copyBtn").disabled,
    marked: document.getElementById("uppercase").closest("fieldset").classList.contains("is-invalid"),
  }));
  assert.deepEqual(fixed, { copy: false, marked: false });
});

test("hiding masks the value, describes it and carries over to the next mode", { skip }, async (t) => {
  const page = await open(t, "");
  await page.press("h");
  const masked = await page.evaluate(() => {
    const button = document.getElementById("heroPassword");
    return { text: button.textContent, label: button.getAttribute("aria-label"), pressed: document.getElementById("maskBtn").getAttribute("aria-pressed") };
  });
  assert.match(masked.text, /^•+$/);
  assert.equal(masked.label, "Hidden password, 16 characters. Click to copy.");
  assert.equal(masked.pressed, "true");

  // "2" is matched by physical key, so it works on layouts that need Shift.
  const loaded = page.connection.once("Page.loadEventFired", page.sessionId);
  await pressCode(page, "ě", "Digit2");
  await loaded;
  assert.match(await page.evaluate(() => location.pathname), /\/passphrase-generator\/$/);
  assert.match(await hero(page), /^•+$/);
});

test("copying puts the value on the clipboard and in the session list", { skip }, async (t) => {
  const page = await open(t, "");
  await page.send("Browser.grantPermissions", {
    origin: new URL(base).origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  const value = await hero(page);
  await page.evaluate(() => document.getElementById("copyBtn").click());
  await sleep(200);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), value);
  const state = await page.evaluate(() => ({
    label: document.querySelector("#copyBtn .btn-label").textContent,
    history: document.getElementById("historyCount").textContent,
    historyHidden: document.getElementById("historyCard").hidden,
  }));
  assert.deepEqual(state, { label: "Copied", history: "1", historyHidden: false });
});

test("a promised clipboard wipe survives a page change and waits for a gesture if refused", { skip }, async (t) => {
  const page = await open(t, "");
  // A clipboard that, like Firefox and Safari, refuses writes outside a
  // user gesture until __allow is set, and records every write.
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__writes = [];
      window.__allow = false;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText(text) {
            window.__writes.push(text);
            return window.__allow ? Promise.resolve() : Promise.reject(new Error("NotAllowedError"));
          },
        },
      });`,
  });
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.reload();

  await page.evaluate(() => {
    window.__allow = true;
    const option = document.getElementById("clearClipboard");
    option.checked = true;
    option.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("copyBtn").click();
  });
  await sleep(200);
  assert.ok(await page.evaluate(() => Number(sessionStorage.getItem("fortipass:clipboardDue")) > 0));

  // Overdue, and the user has moved on to another generator page.
  await page.evaluate(() => sessionStorage.setItem("fortipass:clipboardDue", String(Date.now() - 1)));
  await page.navigate(base + "passphrase-generator/");
  await sleep(300);
  let s = await page.evaluate(() => ({ writes: window.__writes, due: sessionStorage.getItem("fortipass:clipboardDue") }));
  assert.deepEqual(s.writes, [""], "tried on arrival");
  assert.ok(Number(s.due) > 0, "still due after the refusal");

  // Ctrl combinations (the user's own Ctrl+C) and gestures that copy anyway
  // leave the clipboard alone…
  await page.evaluate(() => {
    window.__allow = true;
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));
    document.getElementById("copyBtn").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  await sleep(100);
  assert.deepEqual(await page.evaluate(() => window.__writes), [""]);

  // …and any other click finishes the job.
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  await sleep(200);
  s = await page.evaluate(() => ({
    writes: window.__writes,
    due: sessionStorage.getItem("fortipass:clipboardDue"),
    toast: document.getElementById("toasts").textContent.trim(),
  }));
  assert.deepEqual(s, { writes: ["", ""], due: null, toast: "Clipboard cleared" });
});

test("passphrase and PIN pages generate their own kind of value", { skip }, async (t) => {
  const words = await open(t, "passphrase-generator/");
  assert.match(await hero(words), /^([A-Z][a-z]+-){5}[A-Z][a-z]+\d$/);

  const czech = await open(t, "cs/generator-hesel-ze-slov/");
  assert.deepEqual(
    await czech.evaluate(() => Array.from(document.getElementById("wordLanguage").options, (o) => o.value)),
    ["cs", "en"]
  );
  assert.match(await hero(czech), /^([A-Z][a-z]+-){5}[A-Z][a-z]+\d$/, "no accents by default");

  const pin = await open(t, "pin-generator/");
  assert.match(await hero(pin), /^\d{6}$/);
  await pin.evaluate(() => document.querySelector('[data-preset="pin4"]').click());
  assert.match(await hero(pin), /^\d{4}$/);
});

test("the checker scores as you type and its reveal button keeps one name", { skip }, async (t) => {
  const page = await open(t, "password-strength-checker/");
  await page.evaluate(() => {
    const input = document.getElementById("checkInput");
    input.value = "!QAZ2wsx#EDC4rfv";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(300);
  const result = await page.evaluate(() => ({
    verdict: document.getElementById("checkVerdict").textContent,
    findings: document.getElementById("checkFindings").textContent,
  }));
  assert.equal(result.verdict, "Weak");
  assert.match(result.findings, /keyboard or alphabet run/);

  // Screen readers hear the verdict once typing pauses.
  await sleep(1000);
  assert.match(await page.evaluate(() => document.getElementById("checkStatus").textContent), /^Strength weak, \d+ bits, /);

  await page.evaluate(() => document.getElementById("checkRevealBtn").click());
  const reveal = await page.evaluate(() => {
    const button = document.getElementById("checkRevealBtn");
    return {
      type: document.getElementById("checkInput").type,
      pressed: button.getAttribute("aria-pressed"),
      label: button.getAttribute("aria-label"),
    };
  });
  assert.deepEqual(reveal, { type: "text", pressed: "true", label: "Show password" });
});

test("the Wi-Fi card draws a QR code once it has a name and a valid password", { skip }, async (t) => {
  const page = await open(t, "wifi-password-generator/");
  const qr = () =>
    page.evaluate(() => ({
      shown: !document.getElementById("wifiQr").hasAttribute("hidden"),
      path: document.getElementById("wifiQrPath").getAttribute("d").length > 0,
      print: document.getElementById("wifiPrintBtn").disabled === false,
    }));
  assert.equal((await qr()).shown, false, "no QR code without a network name");

  // Count rewrites of the live hint: typing must not re-announce it.
  await page.evaluate(() => {
    window.hintWrites = 0;
    new MutationObserver(() => window.hintWrites++).observe(document.getElementById("wifiHint"), {
      childList: true,
      characterData: true,
      subtree: true,
    });
    const ssid = document.getElementById("wifiSsid");
    for (const name of ["H", "Ho", "Hom", "Home"]) {
      ssid.value = name;
      ssid.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  assert.deepEqual(await qr(), { shown: true, path: true, print: true });
  assert.equal(await page.evaluate(() => window.hintWrites), 0);

  // 17 accented letters are 34 bytes: more than an SSID may hold.
  await page.evaluate(() => {
    const ssid = document.getElementById("wifiSsid");
    ssid.value = "č".repeat(17);
    ssid.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal((await qr()).shown, false, "a 34-byte network name");
  assert.match(await page.evaluate(() => document.getElementById("wifiHint").textContent), /32 bytes/);
  await page.evaluate(() => {
    const ssid = document.getElementById("wifiSsid");
    ssid.value = "Home";
    ssid.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await page.evaluate(() => {
    const password = document.getElementById("wifiPassword");
    password.value = "short";
    password.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal((await qr()).shown, false, "a router would refuse a 5-character key");
  assert.equal(await page.evaluate(() => document.getElementById("wifiQrPath").getAttribute("d")), "", "no stale code left behind");

  await page.evaluate(() => {
    const security = document.getElementById("wifiSecurity");
    security.value = "nopass";
    security.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.equal(await page.evaluate(() => document.getElementById("wifiPasswordField").hidden), true);
  assert.equal((await qr()).shown, true, "an open network needs no password");
});

test("T switches the theme and remembers it", { skip }, async (t) => {
  const page = await open(t, "how-long-to-crack-a-password/");
  const before = await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);
  await page.press("t");
  const state = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    saved: localStorage.getItem("fortipass:theme"),
  }));
  const expected = before ? "light" : "dark";
  assert.deepEqual(state, { theme: expected, saved: expected });

  // Back to the system's own theme: the page follows the system again.
  await page.press("t");
  const back = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme || null,
    saved: localStorage.getItem("fortipass:theme"),
  }));
  assert.deepEqual(back, { theme: null, saved: null });
});
