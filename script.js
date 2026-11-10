/* ==========================================================================
   FortiPass — user interface. Randomness, generation, entropy maths and the
   strength checker live in core.js; this file only wires them to the page.

   Each page carries one tool — the generator (in one of three modes), the
   strength checker or the Wi-Fi card — so each part below starts only when
   its markup is present. The generator modes are separate pages: the page
   says which mode it is, and only that mode's controls are in the markup.
   ========================================================================== */

(function () {
  "use strict";

  const core = window.FortiPassCore;
  const QR = window.FortiPassQR;
  const locale = window.FortiPassLocale || {};
  const LANG = document.documentElement.lang || "en";

  /* ---------------------------------------------------------------- config */

  const HISTORY_LIMIT = 12;
  const SETTINGS_KEY = "fortipass:settings:v1";
  const WIFI_KEY = "fortipass:wifi:v1";
  const THEME_KEY = "fortipass:theme";
  // Per tab only, so hiding survives switching between generator modes.
  const MASK_KEY = "fortipass:masked";
  // When the clipboard is due to be wiped. Per tab, because the generator
  // modes are separate pages and a timer dies with its page.
  const CLIPBOARD_KEY = "fortipass:clipboardDue";
  // Where the mode switch was on screen when you left for another mode.
  const MODE_TOP_KEY = "fortipass:modeTop";
  const CLIPBOARD_CLEAR_MS = 30000;
  // Screen readers hear the checker's verdict once typing pauses, and a
  // slider's new value once it stops moving, not on every step.
  const CHECK_ANNOUNCE_MS = 900;
  const SLIDER_ANNOUNCE_MS = 700;
  const THEME_COLORS = { light: "#f6f7fb", dark: "#0c0e14" };

  const MODES = ["password", "passphrase", "pin"];
  const NOUNS_EN = {
    password: ["password", "passwords"],
    passphrase: ["passphrase", "passphrases"],
    pin: ["PIN", "PINs"],
  };

  // English strings; locale-cs.js (or another locale file) overrides them.
  const UI_EN = {
    generated: (n, mode, summary, bits) =>
      "Generated " +
      (n > 1 ? n + " " + NOUNS_EN[mode][1] : "a new " + NOUNS_EN[mode][0]) +
      ". " +
      summary +
      ", " +
      bits +
      " bits.",
    strength: (label) => "Strength " + label.toLowerCase(),
    hiddenHero: (mode, length) =>
      "Hidden " + NOUNS_EN[mode][0] + ", " + length + " characters. Click to copy.",
    clickToCopy: "Click to copy",
    hiddenRow: (i) => "Hidden value " + i + ". Click to copy.",
    hiddenFrom: (time) => "Hidden value from " + time + ". Click to copy.",
    replace: "Generate a replacement",
    copy: "Copy",
    copyAll: "Copy all",
    copied: "Copied",
    notGenerated: "Not generated",
    waiting: "Waiting for input",
    bits: (n) => n + (n === 1 ? " bit" : " bits"),
    combinations: (n) => n.toLocaleString("en") + " combinations",
    toCrack: (time) => (time === "instantly" ? "cracked instantly" : time + " to crack"),
    noCrypto:
      "This browser has no secure random number generator, so FortiPass will not generate a password.",
    generationFailed: "Generation failed with these options — try relaxing them.",
    copiedToast: "Copied to clipboard",
    copiedClears: (s) => "Copied — the clipboard clears in " + s + " s",
    clipboardCleared: "Clipboard cleared",
    downloadHeader: (date) =>
      "# FortiPass — generated " +
      date +
      "\n# Store these in a password manager and delete this file.\n\n",
    downloadToast: "Saved as a text file — delete it once stored safely",
    historyCleared: "Session list cleared",
    wifiNeedName: "Type the network name and the QR code appears here.",
    wifiProblem: {
      ssidLong:
        "The network name is too long — routers allow 32 bytes, and an accented letter takes two.",
      short: "A Wi-Fi password needs at least 8 characters, or the router will refuse it.",
      long: "A Wi-Fi password can be at most 63 characters.",
      ascii:
        "Use only plain ASCII characters (no accents) in a Wi-Fi password, or some devices will not connect.",
    },
    // The code still works on most phones, so these warn without hiding it.
    wifiCaution: {
      android:
        "Some Android phones misread a network name or password that ends in a backslash (\\) or sits in double quotes, and will not connect from this code. Typing it in by hand still works.",
      ssidSpaces:
        "The network name starts or ends with a space. That is allowed, but check that the router's name has it too — otherwise phones will not find the network.",
    },
    wifiOk:
      "Your router will accept this password. The QR code holds the network name and password — share it only with people you trust.",
    wifiOpen: "An open network has no password — anyone in range can see what is sent over it.",
    wifiSaved: "QR code saved as an SVG image — it holds the password, so share it with care",
  };
  const UI = Object.assign({}, UI_EN, locale.ui || {});
  // Groups of messages fall back key by key, so a locale that lacks one
  // still shows the English text instead of an empty notice.
  Object.keys(UI_EN).forEach((key) => {
    const base = UI_EN[key];
    if (base && typeof base === "object") UI[key] = Object.assign({}, base, (locale.ui || {})[key]);
  });

  const PASSWORD_BASE = {
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    requireEach: true,
    excludeAmbiguous: false,
    noRepeats: false,
    excludeChars: "",
  };

  // A preset sets these controls. Its chip stays lit while they still match.
  const PRESETS = {
    login: Object.assign({}, PASSWORD_BASE, { length: 16 }),
    paranoid: Object.assign({}, PASSWORD_BASE, { length: 32 }),
    readable: Object.assign({}, PASSWORD_BASE, {
      length: 20,
      symbols: false,
      excludeAmbiguous: true,
    }),
    // Czech government data boxes: 8–32 characters (64 on the newer rules),
    // upper, lower and a digit, no three equal characters in a row, and only
    // some symbols — ^ ; < > / are rejected.
    isds: Object.assign({}, PASSWORD_BASE, {
      length: 24,
      noRepeats: true,
      excludeChars: "^;<>/",
    }),
    pin4: { pinLength: 4 },
    pin6: { pinLength: 6 },
    pin8: { pinLength: 8 },
  };

  // Remembered generator settings: [settings key, element key, kind].
  const FIELDS = [
    ["length", "length", "int"],
    ["count", "count", "int"],
    ["uppercase", "uppercase", "bool"],
    ["lowercase", "lowercase", "bool"],
    ["numbers", "numbers", "bool"],
    ["symbols", "symbols", "bool"],
    ["requireEach", "requireEach", "bool"],
    ["excludeAmbiguous", "excludeAmbiguous", "bool"],
    ["noRepeats", "noRepeats", "bool"],
    ["excludeChars", "excludeChars", "text"],
    ["words", "wordCount", "int"],
    ["language", "wordLanguage", "choice"],
    ["ascii", "asciiOnly", "bool"],
    ["separator", "separator", "choice"],
    ["capitalize", "capitalize", "bool"],
    ["addNumber", "addNumber", "bool"],
    ["addSymbol", "addSymbol", "bool"],
    ["pinLength", "pinLength", "int"],
    ["clearClipboard", "clearClipboard", "bool"],
  ];
  // Every generator page has "How many", but each mode keeps its own: fifty
  // door codes on the PIN page must not turn the password page into a list.
  const PER_MODE = ["count"];
  const LIMITS = {
    length: [4, 128, 16],
    count: [1, 50, 1],
    words: [3, 12, 6],
    pinLength: [3, 16, 6],
  };

  const WIFI_STYLES = {
    easy: { kind: "password", length: 20, symbols: false, excludeAmbiguous: true },
    // Six words clear the meter's "Strong" mark, like the passphrase page.
    words: { kind: "passphrase", words: 6 },
    strong: { kind: "password", length: 32, symbols: true, excludeAmbiguous: false },
    max: { kind: "password", length: 63, symbols: false, excludeAmbiguous: false },
  };

  /* ------------------------------------------------------------------- dom */

  const $ = (sel) => document.querySelector(sel);

  const el = {
    generator: $("#generator"),
    hero: $("#heroPassword"),
    maskBtn: $("#maskBtn"),
    refreshBtn: $("#refreshBtn"),
    copyBtn: $("#copyBtn"),
    downloadBtn: $("#downloadBtn"),
    clearClipboard: $("#clearClipboard"),
    meter: $("#meter"),
    meterTrack: $("#meterTrack"),
    liveStatus: $("#liveStatus"),
    passwordList: $("#passwordList"),

    lengthRange: $("#lengthRange"),
    length: $("#length"),
    uppercase: $("#uppercase"),
    lowercase: $("#lowercase"),
    numbers: $("#numbers"),
    symbols: $("#symbols"),
    requireEach: $("#requireEach"),
    excludeAmbiguous: $("#excludeAmbiguous"),
    noRepeats: $("#noRepeats"),
    excludeChars: $("#excludeChars"),
    advanced: $("#advanced"),
    presets: $("#presets"),

    wordCount: $("#wordCount"),
    wordCountValue: $("#wordCountValue"),
    wordBits: $("#wordBits"),
    wordLanguage: $("#wordLanguage"),
    asciiOnly: $("#asciiOnly"),
    separator: $("#separator"),
    capitalize: $("#capitalize"),
    addNumber: $("#addNumber"),
    addSymbol: $("#addSymbol"),

    pinLength: $("#pinLength"),
    pinLengthValue: $("#pinLengthValue"),

    count: $("#count"),
    countDown: $("#countDown"),
    countUp: $("#countUp"),

    historyCard: $("#historyCard"),
    historyCount: $("#historyCount"),
    historyList: $("#historyList"),
    clearHistoryBtn: $("#clearHistoryBtn"),

    checkInput: $("#checkInput"),
    checkRevealBtn: $("#checkRevealBtn"),
    checkMeter: $("#checkMeter"),
    checkMeterTrack: $("#checkMeterTrack"),
    checkFindings: $("#checkFindings"),
    checkStatus: $("#checkStatus"),

    wifi: $("#wifi"),
    wifiSsid: $("#wifiSsid"),
    wifiSecurity: $("#wifiSecurity"),
    wifiHidden: $("#wifiHidden"),
    wifiStyle: $("#wifiStyle"),
    wifiPassword: $("#wifiPassword"),
    wifiPasswordField: $("#wifiPasswordField"),
    wifiNewBtn: $("#wifiNewBtn"),
    wifiCopyBtn: $("#wifiCopyBtn"),
    wifiMeter: $("#wifiMeter"),
    wifiMeterTrack: $("#wifiMeterTrack"),
    wifiHint: $("#wifiHint"),
    wifiQr: $("#wifiQr"),
    wifiQrPath: $("#wifiQrPath"),
    wifiQrEmpty: $("#wifiQrEmpty"),
    wifiJump: $("#wifiJump"),
    wifiPrintBtn: $("#wifiPrintBtn"),
    wifiSaveBtn: $("#wifiSaveBtn"),
    wifiPrintSsid: $("#wifiPrintSsid"),
    wifiPrintPassword: $("#wifiPrintPassword"),
    wifiPrintPasswordRow: $("#wifiPrintPasswordRow"),

    themeBtn: $("#themeBtn"),
    shortcutsBtn: $("#shortcutsBtn"),
    dialog: $("#shortcutsDialog"),
    closeDialogBtn: $("#closeDialogBtn"),
    copyDialog: $("#copyDialog"),
    copyDialogText: $("#copyDialogText"),
    closeCopyDialogBtn: $("#closeCopyDialogBtn"),
    toasts: $("#toasts"),
  };

  /* ----------------------------------------------------------------- state */

  const state = {
    mode: "password",
    masked: false,
    results: [],
    history: [],
    wifiGenerated: null,
  };

  // When the clipboard should be wiped (ms timestamp), or 0 for never;
  // mirrored in sessionStorage so the next page picks it up.
  let clipboardDue = 0;
  let clipboardTimer = null;
  let checkAnnounceTimer = null;
  let announceTimer = null;
  // Set while the legacy copy path runs, whose own "copy" event is ours.
  let legacyCopying = false;

  /* ------------------------------------------------------------ generation */

  /** A whole number within the limits for `key`; anything unreadable is the default. */
  function limited(value, key) {
    const [min, max, fallback] = LIMITS[key];
    const n = parseInt(value, 10);
    return clamp(Number.isNaN(n) ? fallback : n, min, max);
  }

  const intOf = (node, key) => (node ? limited(node.value, key) : LIMITS[key][2]);
  const boolOf = (node, fallback) => (node ? node.checked : fallback);

  function readOptions() {
    return {
      mode: state.mode,
      length: intOf(el.length, "length"),
      count: intOf(el.count, "count"),
      uppercase: boolOf(el.uppercase, true),
      lowercase: boolOf(el.lowercase, true),
      numbers: boolOf(el.numbers, true),
      symbols: boolOf(el.symbols, true),
      requireEach: boolOf(el.requireEach, true),
      excludeAmbiguous: boolOf(el.excludeAmbiguous, false),
      noRepeats: boolOf(el.noRepeats, false),
      excludeChars: el.excludeChars ? el.excludeChars.value : "",
      words: intOf(el.wordCount, "words"),
      language: el.wordLanguage ? el.wordLanguage.value : core.languages[0],
      ascii: boolOf(el.asciiOnly, true),
      separator: el.separator ? el.separator.value : "-",
      capitalize: boolOf(el.capitalize, true),
      addNumber: boolOf(el.addNumber, true),
      addSymbol: boolOf(el.addSymbol, false),
      pinLength: intOf(el.pinLength, "pinLength"),
    };
  }

  function makerFor(mode) {
    if (mode === "passphrase") return core.makePassphrase;
    if (mode === "pin") return core.makePin;
    return core.makePassword;
  }

  /**
   * @param {{remember?: boolean, live?: boolean, quiet?: boolean}} [config]
   * remember=true adds the result to the session list. Slider-driven
   * regenerations deliberately do not, or the list would fill with values
   * the user never looked at; they pass live=true, so the announcement waits
   * until the slider settles. quiet=true announces nothing: the value a page
   * opens with is part of the page, not news.
   */
  function generate(config) {
    if (!el.generator) return;
    const remember = !!(config && config.remember);
    const live = !!(config && config.live);
    const quiet = !!(config && config.quiet);

    if (!core || !core.hasCrypto) {
      showError(UI.noCrypto);
      return;
    }

    const opts = readOptions();
    const make = makerFor(opts.mode);

    let first;
    const results = [];
    try {
      for (let i = 0; i < opts.count; i++) {
        const next = make(opts);
        if (next.error) {
          showError(next.error, next.code);
          return;
        }
        if (i === 0) first = next;
        results.push(next.value);
      }
    } catch (err) {
      showError(UI.generationFailed);
      return;
    }

    state.results = results;

    renderResults();
    if (opts.mode === "pin") showPinStrength(first.entropy, opts.pinLength);
    else updateMeter(first.entropy);
    if (remember && results.length === 1) pushHistory(first.value);
    syncPresets();
    saveSettings();

    const summary =
      opts.mode === "pin"
        ? UI.combinations(Math.pow(10, opts.pinLength))
        : UI.strength(core.SCORE_LABELS[core.scoreFromBits(first.entropy)]);
    if (!quiet) announce(UI.generated(opts.count, opts.mode, summary, Math.round(first.entropy)), live);
  }

  /** Regenerate one row of a list without touching the others. */
  function regenerateAt(index) {
    const opts = readOptions();
    let result;
    try {
      result = makerFor(opts.mode)(opts);
    } catch (err) {
      result = { error: UI.generationFailed };
    }
    if (result.error) {
      showError(result.error, result.code);
      return;
    }

    state.results[index] = result.value;

    // Swap just this row, so the list keeps its scroll position and the
    // keyboard focus lands on the replacement's button rather than <body>.
    const oldRow = el.passwordList.children[index];
    if (oldRow) {
      const hadFocus = oldRow.contains(document.activeElement);
      const newRow = buildRow(result.value, index, false);
      oldRow.replaceWith(newRow);
      if (hadFocus) newRow.querySelector(".row-btn").focus();
    }
  }

  /* ------------------------------------------------------------- rendering */

  function charClass(ch) {
    if (ch === " ") return "ch ch-space";
    if (ch >= "0" && ch <= "9") return "ch ch-digit";
    if (/\p{L}/u.test(ch)) return "ch ch-letter";
    return "ch ch-symbol";
  }

  /**
   * Paints a value one character at a time so digits and symbols stand out.
   * A passphrase may wrap after any separator, but never inside a word.
   */
  function paint(target, value) {
    target.textContent = "";
    if (state.masked) {
      // One bullet per character, so hiding never changes the layout.
      target.classList.add("is-masked");
      target.textContent = "•".repeat(Array.from(value).length);
      return;
    }
    target.classList.remove("is-masked");
    const breakAfterSymbols = state.mode === "passphrase";
    const frag = document.createDocumentFragment();
    for (const ch of value) {
      const span = document.createElement("span");
      span.className = charClass(ch);
      // A no-break space keeps a space separator visible at a line edge.
      span.textContent = ch === " " ? "\u00A0" : ch;
      frag.appendChild(span);
      if (breakAfterSymbols && !/\p{L}/u.test(ch)) frag.appendChild(document.createElement("wbr"));
    }
    target.appendChild(frag);
  }

  /** Long values get a smaller type size, so they stay on a few lines. */
  function sizeFor(value) {
    const length = Array.from(value).length;
    if (length <= 20) return "l";
    if (length <= 34) return "m";
    if (length <= 60) return "s";
    return "xs";
  }

  function renderHero() {
    const primary = state.results[0] || "";
    el.hero.classList.remove("is-error");
    el.hero.disabled = false;
    el.hero.dataset.size = sizeFor(primary);
    paint(el.hero, primary);
    // Unmasked, the button's own text is its name, so screen readers can
    // read the value. Masked, the bullets would be read out, so describe it.
    if (state.masked) {
      el.hero.setAttribute("aria-label", UI.hiddenHero(state.mode, Array.from(primary).length));
    } else {
      el.hero.removeAttribute("aria-label");
    }
    flash(el.hero);
  }

  function renderList() {
    el.passwordList.textContent = "";
    state.results.forEach((value, index) => {
      el.passwordList.appendChild(buildRow(value, index, true));
    });
  }

  /** One value shows large; a list shows as rows, copied and saved as a whole. */
  function renderResults() {
    const list = state.results.length > 1;
    markInvalid(null);
    el.copyBtn.disabled = false;
    el.maskBtn.disabled = false;
    el.hero.hidden = list;
    el.passwordList.hidden = !list;
    el.downloadBtn.hidden = !list;
    // While "Copied" shows, the label comes back by itself, already right.
    if (!el.copyBtn.classList.contains("is-done")) {
      el.copyBtn.querySelector(".btn-label").textContent = copyLabel();
    }
    if (list) renderList();
    else {
      el.passwordList.textContent = "";
      renderHero();
    }
  }

  /** The main copy button copies the whole list when there is one. */
  function copyLabel() {
    return state.results.length > 1 ? UI.copyAll : UI.copy;
  }

  function buildRow(value, index, animate) {
    const li = document.createElement("li");
    li.className = "password-row";
    if (animate) li.style.animationDelay = Math.min(index * 20, 300) + "ms";
    else li.classList.add("is-static");

    const idx = document.createElement("span");
    idx.className = "row-index";
    idx.textContent = index + 1;

    const text = document.createElement("button");
    text.type = "button";
    text.className = "row-text";
    text.title = UI.clickToCopy;
    text.dataset.copy = "";
    paint(text, value);
    if (state.masked) text.setAttribute("aria-label", UI.hiddenRow(index + 1));

    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.appendChild(iconButton("i-refresh", UI.replace, () => regenerateAt(index)));
    const copyBtn = iconButton("i-copy", UI.copy, () =>
      copyWithFeedback(state.results[index], copyBtn, "i-copy")
    );
    copyBtn.dataset.copy = "";
    actions.appendChild(copyBtn);

    text.addEventListener("click", () => copyWithFeedback(state.results[index], copyBtn, "i-copy"));

    li.appendChild(idx);
    li.appendChild(text);
    li.appendChild(actions);
    return li;
  }

  function iconButton(iconId, label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "row-btn";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML =
      '<svg class="icon icon-sm" aria-hidden="true"><use href="#' + iconId + '"/></svg>';
    button.addEventListener("click", onClick);
    return button;
  }

  function flash(node) {
    node.classList.remove("is-flash");
    // Force a reflow so the animation restarts on every generation.
    void node.offsetWidth;
    node.classList.add("is-flash");
  }

  /**
   * Points at the control behind a generation error: the character types,
   * the excluded characters or the length. `code` null clears every mark.
   */
  function markInvalid(code) {
    const types = el.uppercase && el.uppercase.closest("fieldset");
    if (types) types.classList.toggle("is-invalid", code === "noTypes");
    const excluded = code === "allExcluded" || code === "typeExcluded";
    const marks = [
      [el.excludeChars, excluded && !!el.excludeChars && el.excludeChars.value !== ""],
      [el.length, ["notEnoughUnique", "unsatisfiable", "tooRestrictive"].indexOf(code) !== -1],
    ];
    marks.forEach(([node, invalid]) => {
      if (!node) return;
      if (invalid) node.setAttribute("aria-invalid", "true");
      else node.removeAttribute("aria-invalid");
    });
    if (excluded && el.advanced) el.advanced.open = true;
  }

  function showError(message, code) {
    state.results = [];
    markInvalid(code || null);
    // Nothing to copy or hide until the options work again.
    el.copyBtn.disabled = true;
    el.maskBtn.disabled = true;
    el.copyBtn.querySelector(".btn-label").textContent = UI.copy;
    el.hero.hidden = false;
    el.hero.classList.add("is-error");
    el.hero.classList.remove("is-masked");
    el.hero.removeAttribute("aria-label");
    el.hero.dataset.size = "s";
    el.hero.textContent = message;
    el.hero.disabled = true;
    el.passwordList.hidden = true;
    el.passwordList.textContent = "";
    el.downloadBtn.hidden = true;
    setMeter(el.meter, el.meterTrack, 0, UI.notGenerated, "—", "—");
    toast(message, "error");
  }

  /* ---------------------------------------------------------------- metrics */

  function setMeter(meter, track, score, label, bitsText, crackText) {
    meter.dataset.score = String(score);
    track.setAttribute("aria-valuenow", String(score));
    track.setAttribute("aria-valuetext", label);
    meter.querySelector(".strength-label").textContent = label;
    const values = meter.querySelectorAll(".meta-item span");
    values[0].textContent = bitsText;
    values[1].textContent = crackText;
  }

  const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

  /** core.js writes huge times as "10^19 years"; show 10¹⁹ instead. */
  function prettyPowers(text) {
    return text.replace(/10\^(\d+)/g, (_, exponent) =>
      "10" + exponent.replace(/\d/g, (digit) => SUPERSCRIPT[digit])
    );
  }

  function showBits(meter, track, bits) {
    const score = core.scoreFromBits(bits);
    setMeter(
      meter,
      track,
      score,
      core.SCORE_LABELS[score],
      UI.bits(Math.round(bits)),
      prettyPowers(UI.toCrack(core.formatCrackTime(bits)))
    );
  }

  function updateMeter(bits) {
    showBits(el.meter, el.meterTrack, bits);
  }

  function showPinStrength(bits, digits) {
    setMeter(
      el.meter,
      el.meterTrack,
      core.scoreFromBits(bits),
      UI.combinations(Math.pow(10, digits)),
      UI.bits(Math.round(bits)),
      "—"
    );
  }

  /** "12.9" or "12,9", as the page language writes it. */
  function formatDecimal(value) {
    return value.toLocaleString(LANG, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function updateWordBits() {
    if (!el.wordBits) return;
    const language = el.wordLanguage ? el.wordLanguage.value : core.languages[0];
    el.wordBits.textContent = formatDecimal(Math.log2(Math.max(core.wordCount(language), 2)));
    // Only the Czech words carry accents to leave out.
    if (el.asciiOnly) el.asciiOnly.closest(".switch").hidden = language !== "cs";
  }

  /* -------------------------------------------------------------- clipboard */

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        /* fall through to the legacy path */
      }
    }
    const focused = document.activeElement;
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:-1000px;opacity:0;";
      document.body.appendChild(area);
      area.select();
      legacyCopying = true;
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (err) {
      return false;
    } finally {
      legacyCopying = false;
      // The hidden field took the focus; give it back to the button.
      if (focused && focused.focus) focused.focus();
    }
  }

  async function copyWithFeedback(text, button, restoreIcon) {
    if (!text) return;
    const ok = await copyText(text);
    if (!ok) {
      // The value sits inside a button, where some browsers will not let you
      // select text — so hand it over in a pre-selected field instead.
      openCopyDialog(text);
      return;
    }

    scheduleClipboardClear();
    toast(
      clipboardDue ? UI.copiedClears(CLIPBOARD_CLEAR_MS / 1000) : UI.copiedToast,
      "success"
    );
    // Anything the user actually copied is worth keeping within reach.
    if (text.indexOf("\n") === -1) pushHistory(text);

    if (!button) return;
    const use = button.querySelector("use");
    const label = button.querySelector(".btn-label");
    const previousLabel = label ? label.textContent : null;
    button.classList.add("is-done");
    if (use) use.setAttribute("href", "#i-check");
    if (label) label.textContent = UI.copied;

    clearTimeout(button._resetTimer);
    button._resetTimer = setTimeout(() => {
      button.classList.remove("is-done");
      if (use) use.setAttribute("href", "#" + restoreIcon);
      // The list may have grown or shrunk meanwhile, so ask afresh.
      if (label) label.textContent = button === el.copyBtn ? copyLabel() : previousLabel;
    }, 1600);
  }

  function copyCurrent() {
    if (!state.results.length) return;
    copyWithFeedback(state.results.join("\n"), el.copyBtn, "i-copy");
  }

  function openCopyDialog(text) {
    const area = el.copyDialogText;
    area.value = text;
    if (!el.copyDialog.open) el.copyDialog.showModal();
    // Tall enough for the value as it wraps on this screen, not just for its
    // line breaks; the stylesheet caps the height and scrolls beyond that.
    area.style.height = "auto";
    area.style.height = area.scrollHeight + (area.offsetHeight - area.clientHeight) + "px";
    area.focus();
    area.select();
  }

  function setClipboardDue(due) {
    clipboardDue = due;
    clearTimeout(clipboardTimer);
    try {
      if (due) sessionStorage.setItem(CLIPBOARD_KEY, String(due));
      else sessionStorage.removeItem(CLIPBOARD_KEY);
    } catch (err) {
      /* storage unavailable — the wipe then only survives on this page */
    }
    if (due) clipboardTimer = setTimeout(clearClipboardNow, Math.max(0, due - Date.now()));
  }

  /** The switch lives on the generator pages; elsewhere its saved value counts. */
  function clipboardClearingOn() {
    if (el.clearClipboard) return el.clearClipboard.checked;
    const saved = readSettings();
    return !!saved && saved.clearClipboard === true;
  }

  function scheduleClipboardClear() {
    setClipboardDue(clipboardClearingOn() ? Date.now() + CLIPBOARD_CLEAR_MS : 0);
  }

  function cancelClipboardClear() {
    setClipboardDue(0);
  }

  /**
   * Chromium lets the focused tab write to the clipboard at any time;
   * Firefox and Safari only straight after a click or key press. So the wipe
   * is tried when the timer fires and when the tab regains focus, and — if
   * the browser said no — on the next click or key press on the page (see
   * onGesture). writeText is called synchronously, inside that gesture.
   */
  function clearClipboardNow() {
    const due = clipboardDue;
    if (!due || Date.now() < due) return;
    if (!navigator.clipboard || !navigator.clipboard.writeText || !document.hasFocus()) return;
    navigator.clipboard.writeText("").then(
      () => {
        // A copy made in the meantime set a new deadline; keep that one.
        if (clipboardDue !== due) return;
        setClipboardDue(0);
        toast(UI.clipboardCleared, "info");
      },
      () => {
        /* not allowed yet — the next click or key press tries again */
      }
    );
  }

  /**
   * A click or key press lets Firefox and Safari write to the clipboard.
   * Gestures that copy are skipped — the copy replaces the clipboard anyway,
   * and an empty write racing it could land second — and so are Ctrl/⌘
   * combinations, so a Ctrl+C of the user's own is never wiped.
   */
  function onGesture(event) {
    if (!clipboardDue || Date.now() < clipboardDue) return;
    if (event.type === "keydown") {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.key || "").toLowerCase() === "c") return;
    }
    if (event.target && event.target.closest && event.target.closest("[data-copy]")) return;
    clearClipboardNow();
  }

  function saveFile(content, type, name) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function download() {
    // Local time, like the header inside the file.
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp =
      [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-") +
      "-" +
      [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("-");
    const header = UI.downloadHeader(now.toLocaleString(LANG));
    saveFile(
      header + state.results.join("\n") + "\n",
      "text/plain;charset=utf-8",
      "fortipass-" + stamp + ".txt"
    );
    toast(UI.downloadToast, "info");
  }

  /* ---------------------------------------------------------------- history */

  function pushHistory(value) {
    if (!value || !el.historyCard) return;
    const existing = state.history.findIndex((entry) => entry.value === value);
    if (existing === 0) return;
    // Copying an older entry moves it to the top instead of duplicating it.
    if (existing > 0) state.history.splice(existing, 1);
    state.history.unshift({ value: value, time: new Date() });
    if (state.history.length > HISTORY_LIMIT) state.history.pop();
    renderHistory();
  }

  function renderHistory() {
    if (!el.historyCard) return;
    el.historyCard.hidden = state.history.length === 0;
    if (!state.history.length) el.historyCard.open = false;
    el.historyCount.textContent = String(state.history.length);
    el.historyList.textContent = "";

    state.history.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "password-row is-static";

      const time = document.createElement("span");
      time.className = "row-index history-time";
      time.textContent = entry.time.toLocaleTimeString(LANG, {
        hour: "2-digit",
        minute: "2-digit",
      });

      const text = document.createElement("button");
      text.type = "button";
      text.className = "row-text";
      text.title = UI.clickToCopy;
      text.dataset.copy = "";
      paint(text, entry.value);
      if (state.masked) text.setAttribute("aria-label", UI.hiddenFrom(time.textContent));

      const actions = document.createElement("div");
      actions.className = "row-actions";
      const copyBtn = iconButton("i-copy", UI.copy, () =>
        copyWithFeedback(entry.value, copyBtn, "i-copy")
      );
      copyBtn.dataset.copy = "";
      actions.appendChild(copyBtn);
      text.addEventListener("click", () => copyWithFeedback(entry.value, copyBtn, "i-copy"));

      li.appendChild(time);
      li.appendChild(text);
      li.appendChild(actions);
      el.historyList.appendChild(li);
    });
  }

  /* ------------------------------------------------------- strength checker */

  function runCheck() {
    if (!el.checkInput) return;
    const password = el.checkInput.value;

    clearTimeout(checkAnnounceTimer);
    if (!password) {
      setMeter(el.checkMeter, el.checkMeterTrack, 0, UI.waiting, "—", "—");
      el.checkFindings.textContent = "";
      if (el.checkStatus) el.checkStatus.textContent = "";
      return;
    }

    const result = core.analyze(password);
    showBits(el.checkMeter, el.checkMeterTrack, result.bits);

    // The verdict changes on every keystroke; say it once typing pauses.
    if (el.checkStatus) {
      const summary =
        UI.strength(core.SCORE_LABELS[result.score]) +
        ", " +
        UI.bits(Math.round(result.bits)) +
        ", " +
        prettyPowers(UI.toCrack(core.formatCrackTime(result.bits))) +
        ".";
      checkAnnounceTimer = setTimeout(() => {
        el.checkStatus.textContent = summary;
      }, CHECK_ANNOUNCE_MS);
    }

    // Only findings that are new since the last keystroke animate in; the
    // rest stay put, so the list does not flicker while you type.
    const shown = new Set(Array.from(el.checkFindings.children, (li) => li.textContent));
    el.checkFindings.textContent = "";
    result.findings.forEach((finding) => {
      const li = document.createElement("li");
      li.className = "finding finding-" + finding[0] + (shown.has(finding[1]) ? " is-static" : "");
      const icon = finding[0] === "good" ? "i-check" : "i-warning";
      li.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#' + icon + '"/></svg>';
      const span = document.createElement("span");
      span.textContent = finding[1];
      li.appendChild(span);
      el.checkFindings.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------ Wi-Fi */

  function newWifiPassword() {
    if (!el.wifi || !core || !core.hasCrypto) return;
    const style = WIFI_STYLES[el.wifiStyle.value] || WIFI_STYLES.easy;
    let result;
    if (style.kind === "passphrase") {
      // Accents would lock out devices that only type ASCII.
      result = core.makePassphrase({
        words: style.words,
        language: core.languages.indexOf(LANG) !== -1 ? LANG : core.languages[0],
        ascii: true,
        separator: "-",
        capitalize: true,
        addNumber: true,
        addSymbol: false,
      });
    } else {
      result = core.makePassword({
        length: style.length,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: style.symbols,
        requireEach: true,
        excludeAmbiguous: style.excludeAmbiguous,
        noRepeats: false,
        excludeChars: "",
      });
    }
    if (result.error) {
      toast(result.error, "error");
      return;
    }
    state.wifiGenerated = result;
    el.wifiPassword.value = result.value;
    renderWifi();
  }

  function renderWifi() {
    const ssid = el.wifiSsid.value;
    const open = el.wifiSecurity.value === "nopass";
    const password = el.wifiPassword.value;

    el.wifiPasswordField.hidden = open;
    fitWifiPassword();

    // A password the user typed is scored by the checker; one we generated
    // carries its exact entropy.
    if (!open && password) {
      const generated = state.wifiGenerated && state.wifiGenerated.value === password;
      showBits(
        el.wifiMeter,
        el.wifiMeterTrack,
        generated ? state.wifiGenerated.entropy : core.analyze(password).bits
      );
    } else {
      setMeter(el.wifiMeter, el.wifiMeterTrack, 0, open ? "—" : UI.waiting, "—", "—");
    }

    // A name over 32 bytes is as fatal as a bad password, so it comes first.
    const problem = core.wifiSsidProblem(ssid) || (open ? null : core.wifiPasswordProblem(password));
    // Only worth a word once the code itself is fine.
    const caution = problem
      ? null
      : core.wifiScanCaution({ ssid: ssid, password: password, security: el.wifiSecurity.value });
    // The hint is a live region: rewriting the same text on every keystroke
    // would make screen readers repeat it.
    const hint = problem
      ? UI.wifiProblem[problem]
      : caution
        ? UI.wifiCaution[caution]
        : open
          ? UI.wifiOpen
          : UI.wifiOk;
    if (el.wifiHint.textContent !== hint) el.wifiHint.textContent = hint;
    el.wifiHint.classList.toggle("is-problem", !!problem || !!caution || open);

    el.wifiPrintSsid.textContent = ssid;
    el.wifiPrintPassword.textContent = password;
    el.wifiPrintPasswordRow.hidden = open;

    const ready = ssid.length > 0 && !problem && !!QR;
    // `hidden` is an HTML property; on an <svg> it must be the attribute.
    el.wifiQr.toggleAttribute("hidden", !ready);
    el.wifiQrEmpty.hidden = ready;
    el.wifiPrintBtn.disabled = !ready;
    el.wifiSaveBtn.disabled = !ready;
    // On a phone the card sits below the form; this link leads to it.
    if (el.wifiJump) el.wifiJump.hidden = !ready;
    if (!ready) {
      // Nothing of an old network may linger in the hidden code.
      el.wifiQrPath.setAttribute("d", "");
      el.wifiQrEmpty.textContent = problem ? UI.wifiProblem[problem] : UI.wifiNeedName;
      return;
    }

    const payload = core.wifiPayload({
      ssid: ssid,
      password: password,
      security: el.wifiSecurity.value,
      hidden: el.wifiHidden.checked,
    });
    const qr = QR.encode(payload, { ecc: "M" });
    const side = qr.size + 8;
    el.wifiQr.setAttribute("viewBox", "0 0 " + side + " " + side);
    el.wifiQrPath.setAttribute("d", QR.toPath(qr, 4));
  }

  /**
   * The password field wraps: words at their separators, random characters
   * anywhere (see .wifi-password). Then it is made exactly as tall as that.
   */
  function fitWifiPassword() {
    const area = el.wifiPassword;
    if (!area) return;
    area.classList.toggle("is-words", /^[\p{L}\d]+(?:[-\s._][\p{L}\d]+)+$/u.test(area.value));
    // Hidden (an open network), it has no size to measure.
    if (!area.offsetParent) return;
    area.style.height = "auto";
    area.style.height = area.scrollHeight + (area.offsetHeight - area.clientHeight) + "px";
  }

  /**
   * A Wi-Fi password is one line, though its field wraps: no line break may
   * get in, not even the one a pasted password often brings along.
   */
  function dropLineBreaks() {
    const area = el.wifiPassword;
    const value = area.value;
    if (!/[\r\n]/.test(value)) return;
    const caret = area.selectionStart - (value.slice(0, area.selectionStart).match(/[\r\n]/g) || []).length;
    area.value = value.replace(/[\r\n]+/g, "");
    area.setSelectionRange(caret, caret);
  }

  function saveWifiQr() {
    const viewBox = el.wifiQr.getAttribute("viewBox");
    const side = Number(viewBox.split(" ")[2]);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
      viewBox +
      '" width="' +
      side * 10 +
      '" height="' +
      side * 10 +
      '" shape-rendering="crispEdges"><rect width="' +
      side +
      '" height="' +
      side +
      '" fill="#fff"/><path fill="#000" d="' +
      el.wifiQrPath.getAttribute("d") +
      '"/></svg>\n';
    // "Kavárna" becomes "Kavarna", not "Kav-rna".
    const name = core
      .fold(el.wifiSsid.value)
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    saveFile(svg, "image/svg+xml", "wifi-" + (name || "qr").slice(0, 40) + ".svg");
    toast(UI.wifiSaved, "info");
  }

  function saveWifiSettings() {
    try {
      // Only the choices — never the network name or the password.
      localStorage.setItem(
        WIFI_KEY,
        JSON.stringify({ style: el.wifiStyle.value, security: el.wifiSecurity.value })
      );
    } catch (err) {
      /* storage unavailable */
    }
  }

  function loadWifiSettings() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(WIFI_KEY) || "null");
    } catch (err) {
      saved = null;
    }
    if (!saved || typeof saved !== "object") return;
    if (WIFI_STYLES[saved.style]) el.wifiStyle.value = saved.style;
    if (saved.security === "WPA" || saved.security === "nopass") {
      el.wifiSecurity.value = saved.security;
    }
  }

  function bindWifi() {
    el.wifiNewBtn.addEventListener("click", () => {
      spin(el.wifiNewBtn);
      newWifiPassword();
    });
    el.wifiCopyBtn.addEventListener("click", () =>
      copyWithFeedback(el.wifiPassword.value, el.wifiCopyBtn, "i-copy")
    );
    el.wifiStyle.addEventListener("change", () => {
      saveWifiSettings();
      newWifiPassword();
    });
    el.wifiSecurity.addEventListener("change", () => {
      saveWifiSettings();
      renderWifi();
    });
    el.wifiHidden.addEventListener("change", renderWifi);
    el.wifiSsid.addEventListener("input", renderWifi);
    el.wifiPassword.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });
    el.wifiPassword.addEventListener("input", () => {
      dropLineBreaks();
      renderWifi();
    });
    el.wifiPrintBtn.addEventListener("click", () => window.print());
    el.wifiSaveBtn.addEventListener("click", saveWifiQr);
  }

  /* ----------------------------------------------------------------- toasts */

  function toast(message, kind) {
    const node = document.createElement("div");
    node.className = "toast toast-" + (kind || "info");
    const icon = kind === "success" ? "i-check" : kind === "error" ? "i-warning" : "i-shield";
    node.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#' + icon + '"/></svg>';
    const span = document.createElement("span");
    span.textContent = message;
    node.appendChild(span);
    // One message at a time: a new one replaces whatever is showing.
    Array.from(el.toasts.children).forEach((old) => old.remove());
    el.toasts.appendChild(node);

    setTimeout(() => {
      node.classList.add("is-leaving");
      setTimeout(() => node.remove(), 240);
    }, kind === "error" ? 4200 : 2200);
  }

  /** `later` waits for a pause, so a moving slider is announced once. */
  function announce(message, later) {
    if (!el.liveStatus) return;
    clearTimeout(announceTimer);
    if (later) {
      announceTimer = setTimeout(() => (el.liveStatus.textContent = message), SLIDER_ANNOUNCE_MS);
    } else {
      el.liveStatus.textContent = message;
    }
  }

  /* ------------------------------------------------------------------ theme */

  // The browser-chrome colours as the page ships them: one per system theme.
  const THEME_METAS = Array.from(document.querySelectorAll('meta[name="theme-color"]')).map(
    (meta) => ({ meta: meta, media: meta.getAttribute("media"), content: meta.getAttribute("content") })
  );

  function systemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function effectiveTheme() {
    return document.documentElement.dataset.theme || systemTheme();
  }

  /** "light" or "dark" pins a theme; null follows the system again. */
  function setTheme(theme) {
    const root = document.documentElement;
    try {
      if (theme) localStorage.setItem(THEME_KEY, theme);
      else localStorage.removeItem(THEME_KEY);
    } catch (err) {
      /* private mode — the theme simply will not persist */
    }
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    THEME_METAS.forEach((item) => {
      if (theme) {
        item.meta.removeAttribute("media");
        item.meta.setAttribute("content", THEME_COLORS[theme]);
      } else {
        if (item.media) item.meta.setAttribute("media", item.media);
        item.meta.setAttribute("content", item.content);
      }
    });
  }

  /**
   * Flips light and dark. Landing on the system's own theme hands control
   * back to the system, so the page follows it again from then on.
   */
  function toggleTheme() {
    const next = effectiveTheme() === "light" ? "dark" : "light";
    setTheme(next === systemTheme() ? null : next);
  }

  /* --------------------------------------------------------------- settings */

  /** Where a setting is stored: "count:pin" for one kept per mode. */
  function storedAs(key) {
    return PER_MODE.indexOf(key) === -1 ? key : key + ":" + state.mode;
  }

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      return saved && typeof saved === "object" ? saved : null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Each generator page holds only its own mode's controls, so it updates
   * just those settings and keeps what the other modes remembered.
   */
  function saveSettings() {
    if (!el.generator) return;
    const settings = Object.assign({}, readSettings() || {});
    delete settings.mode; // the address decides the mode now
    PER_MODE.forEach((key) => delete settings[key]); // once shared by every mode
    FIELDS.forEach(([key, id, kind]) => {
      const node = el[id];
      if (!node) return;
      if (kind === "bool") settings[storedAs(key)] = node.checked;
      else if (kind === "int") settings[storedAs(key)] = intOf(node, key);
      else settings[storedAs(key)] = node.value;
    });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      /* storage unavailable — settings just will not be remembered */
    }
  }

  function loadSettings() {
    const saved = readSettings();
    if (!saved) return;

    FIELDS.forEach(([key, id, kind]) => {
      const node = el[id];
      const value = saved[storedAs(key)];
      if (!node || value === undefined) return;
      if (kind === "bool") {
        if (typeof value === "boolean") node.checked = value;
      } else if (kind === "int") {
        const n = limited(value, key);
        if (key === "length") setLength(n);
        else node.value = n;
      } else if (kind === "choice") {
        if (Array.from(node.options).some((option) => option.value === value)) node.value = value;
      } else if (typeof value === "string") {
        node.value = value.slice(0, 60);
      }
    });

    if (el.advanced && (el.excludeAmbiguous.checked || el.noRepeats.checked || el.excludeChars.value)) {
      el.advanced.open = true;
    }
  }

  /* ------------------------------------------------------------------- misc */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setLength(value) {
    el.length.value = value;
    el.lengthRange.value = Math.min(value, parseInt(el.lengthRange.max, 10));
  }

  function presetValue(key) {
    const node = el[key];
    if (!node) return undefined;
    if (node.type === "checkbox") return node.checked;
    if (key === "length" || key === "pinLength") return parseInt(node.value, 10);
    return node.value;
  }

  /** Lights the chip whose preset the current options match, if any. */
  function syncPresets() {
    if (!el.presets) return;
    Array.from(el.presets.children).forEach((chip) => {
      const preset = PRESETS[chip.dataset.preset];
      const on = !!preset && Object.keys(preset).every((key) => presetValue(key) === preset[key]);
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-pressed", String(on));
    });
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    Object.keys(preset).forEach((key) => {
      const node = el[key];
      if (!node) return;
      if (key === "length") setLength(preset.length);
      else if (node.type === "checkbox") node.checked = preset[key];
      else node.value = preset[key];
    });
    // Show the rules a preset switched on, so nothing is set behind your back.
    if (el.advanced && (preset.noRepeats || preset.excludeChars || preset.excludeAmbiguous)) {
      el.advanced.open = true;
    }
    syncSliders();
    generate();
  }

  function syncSliders() {
    if (el.wordCountValue) el.wordCountValue.value = el.wordCount.value;
    if (el.pinLengthValue) el.pinLengthValue.value = el.pinLength.value;
    if (el.count) {
      const n = intOf(el.count, "count");
      el.countDown.disabled = n <= LIMITS.count[0];
      el.countUp.disabled = n >= LIMITS.count[1];
    }

    document.querySelectorAll('input[type="range"]').forEach((range) => {
      const min = parseFloat(range.min || 0);
      const max = parseFloat(range.max || 100);
      const percent = ((parseFloat(range.value) - min) / (max - min)) * 100;
      range.style.setProperty("--fill", percent + "%");
    });
  }

  function toggleMask(force) {
    state.masked = typeof force === "boolean" ? force : !state.masked;
    try {
      if (state.masked) sessionStorage.setItem(MASK_KEY, "1");
      else sessionStorage.removeItem(MASK_KEY);
    } catch (err) {
      /* not remembered across pages — fine */
    }
    el.maskBtn.setAttribute("aria-pressed", String(state.masked));
    el.maskBtn.querySelector("use").setAttribute("href", state.masked ? "#i-eye" : "#i-eye-off");
    // The name stays "Hide" (the pressed state says the rest); the tooltip
    // says what a click will do, like the icon.
    if (!el.maskBtn.dataset.title) el.maskBtn.dataset.title = el.maskBtn.title;
    el.maskBtn.title = state.masked ? el.maskBtn.dataset.titlePressed || el.maskBtn.title : el.maskBtn.dataset.title;
    if (state.results.length) renderResults();
    renderHistory();
  }

  /**
   * A table that scrolls sideways is a tab stop, so keyboard users can
   * scroll it; one that fits needs no extra stop. The markup starts every
   * table focusable, which is the safe default without JavaScript.
   */
  function syncScrollers() {
    document.querySelectorAll(".table-scroll").forEach((box) => {
      if (box.scrollWidth > box.clientWidth + 1) box.setAttribute("tabindex", "0");
      else box.removeAttribute("tabindex");
    });
  }

  function spin(button) {
    const icon = button.querySelector(".icon");
    icon.classList.remove("icon-spin");
    void icon.offsetWidth;
    icon.classList.add("icon-spin");
  }

  function debounce(fn, wait) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  /**
   * Shortcuts are single letters, so they must stay out of the way of text
   * entry — but not of checkboxes and sliders, which take no letters.
   */
  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    if (target.isContentEditable) return true;
    if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
    if (target.tagName !== "INPUT") return false;
    return (
      ["checkbox", "radio", "range", "button", "submit", "reset", "color"].indexOf(target.type) ===
      -1
    );
  }

  function onDialogBackdropClick(dialog) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  /** The generator modes are pages; a shortcut follows the mode's link. */
  function goToMode(mode) {
    const link = document.querySelector('.segmented [data-mode="' + mode + '"]');
    if (!link || link.hasAttribute("aria-current")) return;
    rememberModeSwitch(link);
    window.location.href = link.href;
  }

  /**
   * Each mode's page has its own heading and introduction, so the mode
   * switch sits a little higher or lower on each. Its place on screen is
   * remembered when you switch, and the next page scrolls to put it back
   * under your finger instead of making it jump.
   */
  function rememberModeSwitch(link) {
    const bar = document.querySelector(".segmented");
    try {
      sessionStorage.setItem(
        MODE_TOP_KEY,
        JSON.stringify({ path: new URL(link.href).pathname, top: bar.getBoundingClientRect().top })
      );
    } catch (err) {
      /* not remembered — the page simply opens at the top */
    }
  }

  function restoreModeSwitch() {
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(MODE_TOP_KEY) || "null");
      sessionStorage.removeItem(MODE_TOP_KEY);
    } catch (err) {
      return;
    }
    const bar = document.querySelector(".segmented");
    if (!saved || !bar || saved.path !== location.pathname || typeof saved.top !== "number") return;
    // Only for the click that brought us here, not a reload or Back.
    const entry = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    if (entry && entry.type !== "navigate") return;
    const shift = bar.getBoundingClientRect().top - saved.top;
    if (Math.abs(shift) >= 1) window.scrollTo(0, Math.max(0, window.scrollY + shift));
  }

  /* ---------------------------------------------------------------- wiring */

  function bindGenerator() {
    const modes = document.querySelector(".segmented");
    if (modes) {
      modes.addEventListener("click", (event) => {
        const link = event.target.closest("a.segment");
        if (link && !link.hasAttribute("aria-current")) rememberModeSwitch(link);
      });
    }

    el.refreshBtn.addEventListener("click", () => {
      spin(el.refreshBtn);
      generate({ remember: true });
    });

    el.copyBtn.addEventListener("click", copyCurrent);
    el.hero.addEventListener("click", copyCurrent);
    el.downloadBtn.addEventListener("click", download);
    el.maskBtn.addEventListener("click", () => toggleMask());

    el.clearClipboard.addEventListener("change", () => {
      if (!el.clearClipboard.checked) cancelClipboardClear();
      saveSettings();
    });

    // Sliders regenerate live; the number fields wait for a committed value.
    [el.lengthRange, el.wordCount, el.pinLength].filter(Boolean).forEach((range) => {
      range.addEventListener("input", () => {
        if (range === el.lengthRange) el.length.value = range.value;
        syncSliders();
        generate({ live: true });
      });
    });

    // Each slider has a number field beside it, committed on change.
    [
      [el.length, el.lengthRange, "length"],
      [el.wordCountValue, el.wordCount, "words"],
      [el.pinLengthValue, el.pinLength, "pinLength"],
    ]
      .filter(([input]) => input)
      .forEach(([input, range, key]) => {
        input.addEventListener("change", () => {
          const value = intOf(input, key);
          if (key === "length") setLength(value);
          else range.value = input.value = value;
          syncSliders();
          generate();
        });
      });

    el.count.addEventListener("change", () => {
      el.count.value = intOf(el.count, "count");
      syncSliders();
      generate();
    });
    [
      [el.countDown, -1],
      [el.countUp, 1],
    ].forEach(([button, step]) => {
      button.addEventListener("click", () => {
        el.count.value = clamp(intOf(el.count, "count") + step, LIMITS.count[0], LIMITS.count[1]);
        syncSliders();
        generate();
      });
    });

    // Enter in a number field commits it instead of doing nothing.
    [el.length, el.wordCountValue, el.pinLengthValue, el.count].filter(Boolean).forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
      });
    });

    [
      el.uppercase,
      el.lowercase,
      el.numbers,
      el.symbols,
      el.requireEach,
      el.excludeAmbiguous,
      el.noRepeats,
      el.separator,
      el.wordLanguage,
      el.asciiOnly,
      el.capitalize,
      el.addNumber,
      el.addSymbol,
    ]
      .filter(Boolean)
      .forEach((input) =>
        input.addEventListener("change", () => {
          updateWordBits();
          generate();
        })
      );

    if (el.excludeChars) el.excludeChars.addEventListener("input", debounce(generate, 350));

    if (el.presets) {
      el.presets.addEventListener("click", (event) => {
        const chip = event.target.closest(".chip");
        if (chip) applyPreset(chip.dataset.preset);
      });
    }

    el.clearHistoryBtn.addEventListener("click", () => {
      state.history = [];
      renderHistory();
      toast(UI.historyCleared, "info");
    });
  }

  function bindChecker() {
    el.checkInput.addEventListener("input", debounce(runCheck, 140));
    // A toggle button keeps one name ("Show password") and reports its state
    // through aria-pressed; swapping the name too would read "Hide password,
    // pressed".
    el.checkRevealBtn.addEventListener("click", () => {
      const revealed = el.checkInput.type === "text";
      el.checkInput.type = revealed ? "password" : "text";
      el.checkRevealBtn.setAttribute("aria-pressed", String(!revealed));
      el.checkRevealBtn
        .querySelector("use")
        .setAttribute("href", revealed ? "#i-eye" : "#i-eye-off");
    });
  }

  function bindPage() {
    el.themeBtn.addEventListener("click", toggleTheme);

    el.shortcutsBtn.addEventListener("click", () => el.dialog.showModal());
    el.closeDialogBtn.addEventListener("click", () => el.dialog.close());
    onDialogBackdropClick(el.dialog);

    el.closeCopyDialogBtn.addEventListener("click", () => el.copyDialog.close());
    onDialogBackdropClick(el.copyDialog);
    // Do not leave the value sitting in a hidden field.
    el.copyDialog.addEventListener("close", () => {
      el.copyDialogText.value = "";
    });

    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      // Nothing fires behind an open dialog; Esc closes it natively.
      if (isTypingTarget(event.target) || document.querySelector("dialog[open]")) {
        return;
      }

      // Physical keys for 1/2/3, so layouts that need Shift for digits
      // (Czech, French…) work too. With Num Lock off the keypad's 1, 2 and 3
      // are End, ↓ and Page Down, which must keep scrolling the page — so a
      // keypad key counts only while it types its digit.
      const digit = /^(Digit|Numpad)([1-3])$/.exec(event.code || "");
      if (digit && el.generator && (digit[1] === "Digit" || event.key === digit[2])) {
        goToMode(MODES[Number(digit[2]) - 1]);
        return;
      }

      const key = (event.key || "").toLowerCase();
      if (key === "g") {
        event.preventDefault();
        if (el.generator) {
          spin(el.refreshBtn);
          generate({ remember: true });
        } else if (el.wifi) newWifiPassword();
      } else if (key === "c") {
        if (el.generator) copyCurrent();
        else if (el.wifi) copyWithFeedback(el.wifiPassword.value, el.wifiCopyBtn, "i-copy");
      } else if (key === "h") {
        if (el.generator) toggleMask();
      } else if (key === "t") {
        toggleTheme();
      } else if (event.key === "?") {
        el.dialog.showModal();
      }
    });

    window.addEventListener("focus", clearClipboardNow);
    // Firefox and Safari only write to the clipboard during a user gesture
    // (a touch counts on pointerup, a mouse on pointerdown).
    ["pointerdown", "pointerup", "keydown"].forEach((type) =>
      document.addEventListener(type, onGesture, true)
    );
    // Something the user copies on the page is theirs, so a pending wipe
    // must not destroy it — unless it is our value, copied out of the
    // copy-it-yourself dialog. (A copy in another app cannot be seen; the
    // switch's note says the wipe takes whatever is on the clipboard.)
    document.addEventListener("copy", (event) => {
      if (legacyCopying) return;
      const target = event.target && event.target.nodeType === 1 ? event.target : null;
      if (target && el.copyDialog.contains(target)) scheduleClipboardClear();
      else cancelClipboardClear();
    });

    // Closed <details> do not print, so the FAQ opens for paper and closes
    // again afterwards.
    let openedForPrint = [];
    window.addEventListener("beforeprint", () => {
      openedForPrint = Array.from(document.querySelectorAll(".faq details:not([open])"));
      openedForPrint.forEach((details) => (details.open = true));
    });
    window.addEventListener("afterprint", () => {
      openedForPrint.forEach((details) => (details.open = false));
      openedForPrint = [];
    });

    // Leaving the page (or parking it in the back/forward cache) wipes what
    // the session list, the checker and the Wi-Fi card were holding, as the
    // page promises.
    window.addEventListener("pagehide", () => {
      state.history = [];
      renderHistory();
      if (el.checkInput) {
        el.checkInput.value = "";
        runCheck();
      }
      if (el.wifi) {
        el.wifiPassword.value = "";
        state.wifiGenerated = null;
        // The guest card and the QR code hold the password too.
        renderWifi();
      }
      if (el.copyDialog.open) el.copyDialog.close();
    });
    window.addEventListener("pageshow", (event) => {
      if (!event.persisted) return;
      generate({ quiet: true });
      if (el.wifi) newWifiPassword();
    });
  }

  /* -------------------------------------------------------------------- init */

  function init() {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch (err) {
      /* ignore */
    }

    bindPage();

    // A wipe promised on another page of this tab still has to happen.
    try {
      const due = Number(sessionStorage.getItem(CLIPBOARD_KEY));
      if (due > 0) setClipboardDue(due);
    } catch (err) {
      /* storage unavailable */
    }

    if (el.generator) {
      if (MODES.indexOf(el.generator.dataset.mode) !== -1) state.mode = el.generator.dataset.mode;
      loadSettings();
      bindGenerator();
      updateWordBits();
      syncSliders();
      let masked = false;
      try {
        masked = sessionStorage.getItem(MASK_KEY) === "1";
      } catch (err) {
        masked = false;
      }
      if (masked) toggleMask(true);
      generate({ quiet: true });
      restoreModeSwitch();
    }

    if (el.checkInput) bindChecker();

    if (el.wifi) {
      loadWifiSettings();
      bindWifi();
      newWifiPassword();
    }

    syncSliders();
    syncScrollers();
    window.addEventListener(
      "resize",
      debounce(() => {
        syncScrollers();
        // A new width wraps the Wi-Fi password differently.
        fitWifiPassword();
      }, 150)
    );

    if ("serviceWorker" in navigator) {
      const root = document.documentElement.dataset.root || "./";
      window.addEventListener("load", () => {
        navigator.serviceWorker.register(root + "sw.js").catch(() => {});
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
