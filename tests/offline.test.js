"use strict";

// The service worker's promise: after one visit, every page works with no
// network at all. Serves the site, lets the worker install, then shuts the
// server down and opens pages that were never visited. Skips without a
// browser, like the other browser tests.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const chrome = require("./helpers/chrome");
const site = require("../build/site.js");

const ROOT = path.join(__dirname, "..");
const PREFIX = new URL(site.SITE_URL).pathname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

const skip = chrome.unavailable() || false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

test("after one visit every page opens and works offline", { skip }, async (t) => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}${PREFIX}`;
  const browser = await chrome.launch();
  t.after(async () => {
    await browser.close();
    server.close();
  });

  // Another app published on the same origin (github.io is shared by every
  // repository of the account) keeps its cache when this worker activates.
  const page = await browser.open(base + "robots.txt");
  await page.evaluate(() => caches.open("another-app-v1").then(() => true));
  await page.navigate(base);
  // The worker registers on load; wait until it is active and controls the page.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  for (let i = 0; i < 50 && !(await page.evaluate(() => !!navigator.serviceWorker.controller)); i++) {
    await sleep(100);
  }
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "the worker controls the page");
  assert.ok(await page.evaluate(() => caches.has("another-app-v1")), "another app's cache survives");

  // No network from here on: the server refuses every new connection.
  server.close();
  server.closeAllConnections();
  // Proof: a file the worker leaves to the network no longer loads.
  await assert.rejects(page.navigate(base + "robots.txt"));
  await page.navigate(base);

  const offline = [];
  site.PAGES.forEach((p) => site.LANGUAGES.forEach((lang) => offline.push(p.paths[lang])));
  for (const pagePath of offline) {
    await page.navigate(base + pagePath);
    const s = await page.evaluate(() => ({
      title: document.title,
      styled: getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)",
      hero: (document.getElementById("heroPassword") || {}).textContent,
      core: typeof window.FortiPassCore,
    }));
    assert.match(s.title, /FortiPass/, pagePath);
    assert.ok(s.styled, pagePath + ": the stylesheet came from the cache");
    if (s.hero !== undefined) assert.ok(s.hero.length >= 3, pagePath + ": the generator ran");
  }
  // The checker needs both word lists; scoring proves they loaded offline.
  await page.navigate(base + "cs/kontrola-sily-hesla/");
  await page.evaluate(() => {
    const input = document.getElementById("checkInput");
    input.value = "kocicka";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(300);
  assert.equal(await page.evaluate(() => document.getElementById("checkVerdict").textContent), "Velmi slabé");
  assert.deepEqual(page.errors.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(e)), []);
});
