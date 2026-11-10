/* FortiPass browser extension popup. It runs the website's own core.js and
   word lists (copied in by `npm run build:extension`), needs no browser
   permissions and makes no network requests — the manifest's CSP forbids
   them. Settings live in the popup's own localStorage. */

(function () {
  "use strict";

  const api = globalThis.browser || globalThis.chrome;
  const t = (key, substitutions) => api.i18n.getMessage(key, substitutions) || key;
  const czech = (api.i18n.getUILanguage() || "").toLowerCase().startsWith("cs");
  const SITE = "https://robertlib.github.io/forti-pass/";
  const KEY = "fortipass:extension:v1";

  const core = globalThis.FortiPassCreateCore({
    crypto: globalThis.crypto,
    wordLists: globalThis.FortiPassWordLists,
    messages: czech ? globalThis.FortiPassLocale.core : undefined,
  });

  const $ = (id) => document.getElementById(id);
  const tabs = Array.from(document.querySelectorAll("[data-mode]"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));
  const inputs = ["length", "upper", "lower", "digits", "symbols", "readable", "words", "language", "pin"];

  let mode = "password";
  let current = "";

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  $("site").href = czech ? SITE + "cs/" : SITE;

  function load() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch (err) {
      saved = null;
    }
    $("language").value = czech ? "cs" : "en";
    if (!saved) return;
    if (["password", "passphrase", "pin"].includes(saved.mode)) mode = saved.mode;
    inputs.forEach((id) => {
      if (!(id in saved)) return;
      const input = $(id);
      if (input.type === "checkbox") input.checked = !!saved[id];
      else input.value = saved[id];
    });
  }

  function save() {
    const settings = { mode: mode };
    inputs.forEach((id) => {
      const input = $(id);
      settings[id] = input.type === "checkbox" ? input.checked : input.value;
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch (err) {
      /* not remembered — fine */
    }
  }

  function paint(value) {
    const out = $("value");
    out.textContent = "";
    for (const ch of value) {
      const span = document.createElement("span");
      if (ch >= "0" && ch <= "9") span.className = "d";
      else if (!/\p{L}/u.test(ch)) span.className = "s";
      span.textContent = ch;
      out.appendChild(span);
    }
  }

  function generate() {
    $("lengthValue").value = $("length").value;
    $("wordsValue").value = $("words").value;
    $("pinValue").value = $("pin").value;

    const options = {
      length: Number($("length").value),
      uppercase: $("upper").checked,
      lowercase: $("lower").checked,
      numbers: $("digits").checked,
      symbols: $("symbols").checked,
      requireEach: true,
      excludeAmbiguous: $("readable").checked,
      noRepeats: false,
      excludeChars: "",
      words: Number($("words").value),
      language: $("language").value,
      ascii: true,
      separator: "-",
      capitalize: true,
      addNumber: true,
      addSymbol: false,
      pinLength: Number($("pin").value),
    };
    const make = mode === "passphrase" ? core.makePassphrase : mode === "pin" ? core.makePin : core.makePassword;
    const result = make(options);

    if (result.error) {
      current = "";
      $("value").textContent = result.error;
      $("meter").dataset.score = "0";
      $("label").textContent = "";
      $("bits").textContent = "";
      $("crack").textContent = "";
      return;
    }

    current = result.value;
    paint(current);
    const score = core.scoreFromBits(result.entropy);
    $("meter").dataset.score = String(score);
    $("label").textContent = core.SCORE_LABELS[score];
    $("bits").textContent = t("bits", [String(Math.round(result.entropy))]);
    $("crack").textContent = t("toCrack", [core.formatCrackTime(result.entropy)]);
    save();
  }

  function setMode(next) {
    mode = next;
    tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.mode === mode)));
    panels.forEach((panel) => (panel.hidden = panel.dataset.panel !== mode));
    generate();
  }

  async function copy() {
    if (!current) return;
    const button = $("copyBtn");
    try {
      await navigator.clipboard.writeText(current);
      button.textContent = t("copied");
      setTimeout(() => (button.textContent = t("copy")), 1400);
    } catch (err) {
      const range = document.createRange();
      range.selectNodeContents($("value"));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = t("copyFailed");
    }
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  inputs.forEach((id) => $(id).addEventListener("input", generate));
  $("newBtn").addEventListener("click", generate);
  $("copyBtn").addEventListener("click", copy);

  load();
  setMode(mode);
})();
