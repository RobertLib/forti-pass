"use strict";

/* Drives the real extension popup in headless Chromium. Skips when no
   suitable browser (or no built-in WebSocket) is available. */

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const chrome = require("./helpers/chrome");
const { build } = require("../build/extension.js");

const reason = chrome.unavailable();

/** Builds the extension into a temporary folder and opens its popup. */
function popupSuite(lang, body) {
  describe(`extension popup (${lang})`, { skip: reason || false }, () => {
    const ctx = {};
    let dist;

    before(async () => {
      dist = fs.mkdtempSync(path.join(os.tmpdir(), "fortipass-ext-"));
      const { dir } = build(dist);
      ctx.browser = await chrome.launch({ lang, extension: dir });
      ctx.open = async () => {
        let page;
        try {
          page = await ctx.browser.open(ctx.browser.extensionUrl("popup.html"));
        } catch (err) {
          return null; // the browser refused the extension (branded Chrome 137+)
        }
        // Start every test from the defaults.
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        return page;
      };
    });

    after(async () => {
      if (ctx.browser) await ctx.browser.close();
      if (dist) fs.rmSync(dist, { recursive: true, force: true });
    });

    body(ctx);
  });
}

/** Opens a fresh popup, or skips when this browser would not load the extension. */
async function openPopup(ctx, t) {
  const page = await ctx.open();
  if (!page) t.skip(`${ctx.browser.executable} did not load the unpacked extension`);
  return page;
}

const state = () => ({
  lang: document.documentElement.lang,
  value: document.getElementById("value").textContent,
  metaHidden: document.getElementById("meta").hidden,
  meta: document.getElementById("meta").textContent,
  copy: document.getElementById("copyBtn").textContent,
  status: document.getElementById("status").textContent,
  focused: document.activeElement && document.activeElement.id,
  tabs: Array.from(document.querySelectorAll('[role="tab"]'), (tab) => ({
    id: tab.id,
    selected: tab.getAttribute("aria-selected"),
    tabIndex: tab.tabIndex,
    controls: tab.getAttribute("aria-controls"),
  })),
  panels: Array.from(document.querySelectorAll('[role="tabpanel"]'), (panel) => ({
    id: panel.id,
    hidden: panel.hidden,
    labelledBy: panel.getAttribute("aria-labelledby"),
  })),
  tablistLabel: document.querySelector('[role="tablist"]').getAttribute("aria-label"),
});

const range = (id) => {
  const input = document.getElementById(id);
  return [Number(input.min), Number(input.max), Number(input.value)];
};

popupSuite("en", (ctx) => {
  test("opens in English with the website's defaults and no errors", async (t) => {
    const page = await openPopup(ctx, t);
    if (!page) return;
    const s = await page.evaluate(state);
    assert.equal(s.lang, "en");
    assert.equal(Array.from(s.value).length, 16);
    assert.match(s.meta, /^\S.* · \d+ bits · .+ to crack$/);
    assert.deepEqual(await page.evaluate(range, "length"), [4, 64, 16]);
    assert.deepEqual(await page.evaluate(range, "words"), [3, 12, 6]);
    assert.deepEqual(await page.evaluate(range, "pin"), [3, 16, 6]);
    assert.equal(await page.evaluate(() => document.getElementById("language").value), "en");
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test("the mode tabs follow the ARIA tabs pattern", async (t) => {
    const page = await openPopup(ctx, t);
    if (!page) return;
    let s = await page.evaluate(state);
    assert.equal(s.tablistLabel, "Generator type");
    s.tabs.forEach((tab, i) => {
      assert.equal(tab.controls, s.panels[i].id);
      assert.equal(s.panels[i].labelledBy, tab.id);
    });
    assert.deepEqual(s.tabs.map((tab) => [tab.selected, tab.tabIndex]), [["true", 0], ["false", -1], ["false", -1]]);

    await page.evaluate(() => document.getElementById("tab-password").focus());
    const expectations = [
      ["ArrowRight", "tab-passphrase"],
      ["End", "tab-pin"],
      ["ArrowRight", "tab-password"],
      ["ArrowLeft", "tab-pin"],
      ["Home", "tab-password"],
    ];
    for (const [key, id] of expectations) {
      await page.press(key);
      s = await page.evaluate(state);
      assert.equal(s.focused, id, key);
      s.tabs.forEach((tab) => {
        assert.equal(tab.selected, String(tab.id === id), `${key}: aria-selected of ${tab.id}`);
        assert.equal(tab.tabIndex, tab.id === id ? 0 : -1, `${key}: tabindex of ${tab.id}`);
      });
      s.panels.forEach((panel) => assert.equal(panel.hidden, panel.labelledBy !== id, `${key}: ${panel.id}`));
    }
    await page.close();
  });

  test("an impossible setting shows the error without a stray verdict line", async (t) => {
    const page = await openPopup(ctx, t);
    if (!page) return;
    await page.evaluate(() => {
      ["upper", "lower", "digits", "symbols"].forEach((id) => {
        const box = document.getElementById(id);
        box.checked = false;
        box.dispatchEvent(new Event("input"));
      });
    });
    const s = await page.evaluate(state);
    assert.equal(s.value, "Select at least one character type.");
    assert.equal(s.metaHidden, true);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("meta")).visibility), "hidden");
    // Nothing to copy, so the button says so instead of doing nothing.
    assert.equal(await page.evaluate(() => document.getElementById("copyBtn").disabled), true);
    await page.evaluate(() => {
      const box = document.getElementById("digits");
      box.checked = true;
      box.dispatchEvent(new Event("input"));
    });
    assert.equal(await page.evaluate(() => document.getElementById("copyBtn").disabled), false);
    await page.close();
  });

  test("a failed copy explains itself and the Copy label comes back", async (t) => {
    const page = await openPopup(ctx, t);
    if (!page) return;
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
      document.getElementById("copyBtn").click();
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    let s = await page.evaluate(state);
    assert.equal(s.copy, "Select the text and copy it yourself.");
    assert.equal(s.status, "Select the text and copy it yourself.");
    assert.equal(await page.evaluate(() => String(getSelection())), s.value);

    // A new value puts the label back at once…
    await page.evaluate(() => document.getElementById("newBtn").click());
    s = await page.evaluate(state);
    assert.equal(s.copy, "Copy");
    assert.equal(s.status, "");

    // …and so does the timer.
    await page.evaluate(() => document.getElementById("copyBtn").click());
    await new Promise((resolve) => setTimeout(resolve, 4300));
    assert.equal((await page.evaluate(state)).copy, "Copy");
    await page.close();
  });

  test("a successful copy says so, then restores the label", async (t) => {
    const page = await openPopup(ctx, t);
    if (!page) return;
    await page.evaluate(() => {
      window.copied = null;
      navigator.clipboard.writeText = (text) => {
        window.copied = text;
        return Promise.resolve();
      };
      document.getElementById("copyBtn").click();
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const s = await page.evaluate(state);
    assert.equal(s.copy, "Copied");
    assert.equal(await page.evaluate(() => window.copied), s.value);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    assert.equal((await page.evaluate(state)).copy, "Copy");
    await page.close();
  });

  test("a weak PIN reads “cracked instantly”", async (t) => {
    const page = await openPopup(ctx, t);
    if (!page) return;
    await page.evaluate(() => {
      document.getElementById("tab-pin").click();
      const pin = document.getElementById("pin");
      pin.value = "3";
      pin.dispatchEvent(new Event("input"));
    });
    const s = await page.evaluate(state);
    assert.match(s.value, /^\d{3}$/);
    assert.equal(s.meta, "Very weak · 10 bits · cracked instantly");
    await page.close();
  });

  test("settings survive reopening the popup", async (t) => {
    const page = await openPopup(ctx, t);
    if (!page) return;
    await page.evaluate(() => {
      document.getElementById("tab-passphrase").click();
      const words = document.getElementById("words");
      words.value = "12";
      words.dispatchEvent(new Event("input"));
    });
    await page.reload();
    const s = await page.evaluate(state);
    assert.equal(s.tabs[1].selected, "true");
    assert.equal(s.value.split("-").length, 12);
    await page.close();
  });
});

popupSuite("cs", (ctx) => {
  test("opens in Czech, with Czech words for passphrases", async (t) => {
    const page = await openPopup(ctx, t);
    if (!page) return;
    let s = await page.evaluate(state);
    if (s.lang !== "cs") {
      t.skip("this browser ignored the requested UI language");
      return;
    }
    assert.equal(s.tablistLabel, "Typ generátoru");
    assert.match(s.meta, / · \d+ b · .+ na prolomení$/);
    await page.evaluate(() => document.getElementById("tab-passphrase").click());
    assert.equal(await page.evaluate(() => document.getElementById("language").value), "cs");
    await page.evaluate(() => {
      document.getElementById("tab-pin").click();
      const pin = document.getElementById("pin");
      pin.value = "3";
      pin.dispatchEvent(new Event("input"));
    });
    s = await page.evaluate(state);
    assert.equal(s.meta, "Velmi slabé · 10 b · prolomení okamžitě");
    assert.deepEqual(page.errors, []);
    await page.close();
  });
});
