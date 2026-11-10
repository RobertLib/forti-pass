"use strict";

/* A small headless Chromium driver for tests, speaking the DevTools protocol
   over Node's built-in WebSocket — no npm dependencies.

     const chrome = require("./helpers/chrome");
     const reason = chrome.unavailable();           // null, or why tests should skip
     const browser = await chrome.launch({ lang: "cs", extension: dir });
     const page = await browser.open(browser.extensionUrl("popup.html"));
     await page.evaluate(() => document.title);
     await page.press("ArrowRight");
     page.errors;                                    // uncaught exceptions, console/CSP errors
     await browser.close();

   The browser is FORTIPASS_CHROME if set, else the newest Chromium in
   Playwright's download cache, else an installed Chrome or Chromium.
   Branded Chrome 137+ may refuse --load-extension; tests that need an
   extension should check that its page really loaded and skip if not. */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

const TIMEOUT = 15000;

function playwrightCache() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || os.homedir(), "ms-playwright");
  return path.join(os.homedir(), ".cache", "ms-playwright");
}

function fromPlaywright() {
  const cache = playwrightCache();
  let dirs;
  try {
    dirs = fs.readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name));
  } catch (err) {
    return null;
  }
  dirs.sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  const inside = [
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    "chrome-linux64/chrome",
    "chrome-linux/chrome",
    "chrome-win64/chrome.exe",
    "chrome-win/chrome.exe",
  ];
  for (const dir of dirs) {
    for (const rel of inside) {
      const file = path.join(cache, dir, rel);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

function fromSystem() {
  const candidates = {
    darwin: [
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ],
    win32: ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]
      .filter((key) => process.env[key])
      .map((key) => path.join(process.env[key], "Google", "Chrome", "Application", "chrome.exe")),
  }[process.platform];
  if (candidates) return candidates.find((file) => fs.existsSync(file)) || null;
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    try {
      return execFileSync("which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch (err) {
      /* not installed */
    }
  }
  return null;
}

/** Path of the browser to drive, or null. */
function findBrowser() {
  const own = process.env.FORTIPASS_CHROME;
  if (own) return fs.existsSync(own) ? own : null;
  return fromPlaywright() || fromSystem();
}

/**
 * Branded Google Chrome — not Chromium or Chrome for Testing — which since
 * version 137 may ignore --load-extension. Only there is a missing
 * extension the browser's choice rather than a broken build.
 */
function isBrandedChrome(executable) {
  const file = String(executable).replace(/\\/g, "/");
  if (/for Testing|chromium|ms-playwright/i.test(file)) return false;
  return /Google Chrome\.app\/|\/Google\/Chrome\/Application\/|google-chrome/i.test(file);
}

/** Why browser tests cannot run here, or null when they can. */
function unavailable() {
  if (typeof WebSocket !== "function") return "needs Node 22+ for the built-in WebSocket";
  if (!findBrowser()) return "no Chromium found (set FORTIPASS_CHROME to a Chrome or Chromium binary)";
  return null;
}

/** The ID Chromium gives an unpacked extension loaded from `dir`. */
function extensionId(dir) {
  let real = fs.realpathSync(dir);
  let bytes;
  if (process.platform === "win32") {
    real = real.replace(/^[a-z]:/, (drive) => drive.toUpperCase());
    bytes = Buffer.from(real, "utf16le");
  } else {
    bytes = Buffer.from(real, "utf8");
  }
  const hex = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  return Array.from(hex, (c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out: ${what}`)), TIMEOUT);
    }),
  ]).finally(() => clearTimeout(timer));
}

class Connection {
  constructor(socket) {
    this.socket = socket;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject, method } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      } else {
        this.listeners.forEach((listener) => listener(message));
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    const reply = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return withTimeout(reply, method);
  }

  /**
   * Resolves with the params of the next `method` event for `sessionId`.
   * Never reported as unhandled, so a caller that gives up early can drop it.
   */
  once(method, sessionId) {
    let listener;
    const event = withTimeout(
      new Promise((resolve) => {
        listener = (message) => {
          if (message.method === method && message.sessionId === sessionId) resolve(message.params);
        };
        this.listeners.add(listener);
      }),
      method
    ).finally(() => this.listeners.delete(listener));
    event.catch(() => {});
    return event;
  }
}

const KEYS = {
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Home: 36,
  End: 35,
  Enter: 13,
  Tab: 9,
  Escape: 27,
  " ": 32,
};

class Page {
  constructor(connection, targetId, sessionId) {
    this.connection = connection;
    this.targetId = targetId;
    this.sessionId = sessionId;
    /** Uncaught exceptions and console or browser-log errors, as strings. */
    this.errors = [];
    connection.listeners.add((message) => {
      if (message.sessionId !== sessionId) return;
      const p = message.params;
      if (message.method === "Runtime.exceptionThrown") {
        this.errors.push((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text);
      } else if (message.method === "Runtime.consoleAPICalled" && p.type === "error") {
        this.errors.push(p.args.map((arg) => (arg.value !== undefined ? arg.value : arg.description)).join(" "));
      } else if (message.method === "Log.entryAdded" && p.entry.level === "error") {
        this.errors.push(p.entry.text);
      }
    });
  }

  send(method, params) {
    return this.connection.send(method, params, this.sessionId);
  }

  async navigate(url) {
    const loaded = this.connection.once("Page.loadEventFired", this.sessionId);
    const result = await this.send("Page.navigate", { url });
    if (result.errorText) throw new Error(`${url}: ${result.errorText}`);
    await loaded;
  }

  async reload() {
    const loaded = this.connection.once("Page.loadEventFired", this.sessionId);
    await this.send("Page.reload");
    await loaded;
  }

  /**
   * Runs an expression, or a function with JSON-serialisable arguments, in
   * the page as a user gesture; awaits promises and returns the value.
   */
  async evaluate(fn, ...args) {
    const expression = typeof fn === "function" ? `(${fn})(...${JSON.stringify(args)})` : String(fn);
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error((details.exception && details.exception.description) || details.text);
    }
    return result.result.value;
  }

  /** A real key press, delivered to whatever has focus. */
  async press(key) {
    const code = KEYS[key] || key.toUpperCase().charCodeAt(0);
    const base = { key, code: key.length === 1 ? "Key" + key.toUpperCase() : key, windowsVirtualKeyCode: code };
    await this.send("Input.dispatchKeyEvent", Object.assign({ type: "keyDown" }, base, key.length === 1 ? { text: key } : {}));
    await this.send("Input.dispatchKeyEvent", Object.assign({ type: "keyUp" }, base));
  }

  close() {
    return this.connection.send("Target.closeTarget", { targetId: this.targetId });
  }
}

/**
 * Starts a headless browser.
 * @param {{ lang?: string, extension?: string, args?: string[], executablePath?: string }} options
 *   `lang` sets the UI language ("en", "cs"); `extension` loads that
 *   unpacked extension directory.
 */
async function launch(options = {}) {
  const executable = options.executablePath || findBrowser();
  if (!executable) throw new Error("no Chromium found");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fortipass-chrome-"));
  const lang = options.lang || "en";
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--password-store=basic",
    "--use-mock-keychain",
    `--lang=${lang}`,
  ];
  if (process.getuid && process.getuid() === 0) args.push("--no-sandbox");
  if (options.extension) {
    args.push(
      `--load-extension=${options.extension}`,
      `--disable-extensions-except=${options.extension}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch"
    );
  }
  // No initial tab: pages come from open(). It also keeps the "(en)" below,
  // which Chromium would otherwise take for a URL, from opening one.
  args.push("--no-startup-window", ...(options.args || []));
  // macOS takes the UI language from the AppleLanguages default, not --lang.
  if (process.platform === "darwin") args.push("-AppleLanguages", `(${lang})`);

  const child = spawn(executable, args, {
    stdio: "ignore",
    env: Object.assign({}, process.env, { LANGUAGE: lang, LANG: `${lang}.UTF-8` }),
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));

  const portFile = path.join(profile, "DevToolsActivePort");
  let endpoint = null;
  for (let waited = 0; !endpoint && waited < TIMEOUT; waited += 100) {
    if (child.exitCode !== null) break;
    try {
      const [port, route] = fs.readFileSync(portFile, "utf8").trim().split("\n");
      if (port && route) endpoint = `ws://127.0.0.1:${port}${route}`;
    } catch (err) {
      /* not written yet */
    }
    if (!endpoint) await sleep(100);
  }
  const cleanup = async () => {
    if (child.exitCode === null) child.kill();
    await Promise.race([exited, sleep(5000)]);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  if (!endpoint) {
    await cleanup();
    throw new Error(`${executable} did not open a DevTools port`);
  }

  const socket = new WebSocket(endpoint);
  try {
    await withTimeout(
      new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", () => reject(new Error("DevTools connection failed")), { once: true });
      }),
      "DevTools connection"
    );
  } catch (err) {
    // Never leave a browser and its profile behind.
    socket.close();
    await cleanup();
    throw err;
  }
  const connection = new Connection(socket);
  const id = options.extension ? extensionId(options.extension) : null;

  return {
    executable,
    extensionId: id,
    /** chrome-extension://<id>/<file> for the loaded extension. */
    extensionUrl(file) {
      if (!id) throw new Error("launched without an extension");
      return `chrome-extension://${id}/${file}`;
    },
    /** Opens `url` in a new tab and resolves once it has loaded. */
    async open(url) {
      const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await connection.send("Target.attachToTarget", { targetId, flatten: true });
      const page = new Page(connection, targetId, sessionId);
      await Promise.all([
        page.send("Page.enable"),
        page.send("Runtime.enable"),
        page.send("Log.enable"),
        page.send("Emulation.setFocusEmulationEnabled", { enabled: true }),
      ]);
      await page.send("Page.bringToFront");
      await page.navigate(url);
      return page;
    },
    async close() {
      try {
        await connection.send("Browser.close");
      } catch (err) {
        /* already gone */
      }
      socket.close();
      await cleanup();
    },
  };
}

module.exports = { findBrowser, isBrandedChrome, unavailable, launch, extensionId };
