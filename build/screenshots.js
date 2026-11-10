#!/usr/bin/env node
"use strict";

/* Screenshots for the manifests' install dialog: the password generator in
   each language, as a computer (wide) and a phone (narrow) show it, in the
   dark theme the manifests use as their colours.

     npm run screenshots

   Drives headless Chromium with the same helper as the browser tests, so it
   needs no npm packages. The sizes come from build.js, which writes them
   into the manifests; site.test.js checks the files match. */

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const chrome = require("../tests/helpers/chrome");
const site = require("./site");
const { SCREENSHOT_SIZES } = require("./build");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "screenshots");
const PREFIX = new URL(site.SITE_URL).pathname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
// CSS pixels and pixel ratio for each form factor; × gives SCREENSHOT_SIZES.
const DEVICES = {
  wide: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  narrow: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function serve() {
  const server = http.createServer((request, response) => {
    let file = decodeURIComponent(new URL(request.url, "http://x").pathname);
    file = file.startsWith(PREFIX) ? "/" + file.slice(PREFIX.length) : "/missing";
    if (file.endsWith("/")) file += "index.html";
    // No service worker: every shot shows the files as they are on disk.
    const full = path.join(ROOT, path.normalize(file));
    if (file === "/sw.js" || !full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": TYPES[path.extname(full)] || "application/octet-stream" });
    response.end(fs.readFileSync(full));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function main() {
  const reason = chrome.unavailable();
  if (reason) throw new Error(reason);
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}${PREFIX}`;
  const browser = await chrome.launch({ args: ["--hide-scrollbars"] });
  try {
    for (const lang of site.LANGUAGES) {
      const home = site.PAGES.find((page) => page.id === "home").paths[lang];
      for (const [form, device] of Object.entries(DEVICES)) {
        const expected = SCREENSHOT_SIZES[form].join("x");
        const actual = `${device.width * device.deviceScaleFactor}x${device.height * device.deviceScaleFactor}`;
        if (actual !== expected) throw new Error(`${form}: device gives ${actual}, build.js says ${expected}`);

        const page = await browser.open("about:blank");
        await page.send("Emulation.setDeviceMetricsOverride", device);
        await page.send("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-color-scheme", value: "dark" },
            { name: "prefers-reduced-motion", value: "reduce" },
          ],
        });
        await page.navigate(base + home);
        await sleep(400);
        const { data } = await page.send("Page.captureScreenshot", { format: "png" });
        const file = path.join(OUT, `${lang}-${form}.png`);
        fs.writeFileSync(file, Buffer.from(data, "base64"));
        console.log("Wrote " + path.relative(ROOT, file));
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
