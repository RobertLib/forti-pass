/* ==========================================================================
   FortiPass — user interface. Randomness, generation, entropy maths and the
   strength checker live in core.js; this file only wires them to the page.
   ========================================================================== */

(function () {
  "use strict";

  const core = window.FortiPassCore;

  /* ---------------------------------------------------------------- config */

  const HISTORY_LIMIT = 12;
  const SETTINGS_KEY = "fortipass:settings:v1";
  const THEME_KEY = "fortipass:theme";
  const CLIPBOARD_CLEAR_MS = 30000;

  const MODES = ["password", "passphrase", "pin"];
  const NOUNS = {
    password: ["password", "passwords"],
    passphrase: ["passphrase", "passphrases"],
    pin: ["PIN", "PINs"],
  };

  const PRESETS = {
    memorable: {
      mode: "passphrase",
      wordCount: 6,
      separator: "-",
      capitalize: true,
      addNumber: true,
      addSymbol: false,
      count: 1,
    },
    login: {
      mode: "password",
      length: 16,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
      requireEach: true,
      excludeAmbiguous: false,
      noRepeats: false,
      count: 1,
    },
    paranoid: {
      mode: "password",
      length: 32,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
      requireEach: true,
      excludeAmbiguous: false,
      noRepeats: false,
      count: 1,
    },
    readable: {
      mode: "password",
      length: 20,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: false,
      requireEach: true,
      excludeAmbiguous: true,
      noRepeats: false,
      count: 1,
    },
    pin: { mode: "pin", pinLength: 6, count: 1 },
  };

  /* ------------------------------------------------------------------- dom */

  const $ = (sel) => document.querySelector(sel);

  const el = {
    tablist: $(".tabs"),
    tabs: Array.from(document.querySelectorAll(".tab")),
    panels: {
      password: $("#panel-password"),
      passphrase: $("#panel-passphrase"),
      pin: $("#panel-pin"),
    },
    hero: $("#heroPassword"),
    heroHint: $("#heroHint"),
    maskBtn: $("#maskBtn"),
    refreshBtn: $("#refreshBtn"),
    copyBtn: $("#copyBtn"),
    clearClipboard: $("#clearClipboard"),
    generateBtn: $("#generateBtn"),
    meter: $("#meter"),
    meterTrack: $("#meterTrack"),
    liveStatus: $("#liveStatus"),

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

    wordCount: $("#wordCount"),
    wordCountValue: $("#wordCountValue"),
    separator: $("#separator"),
    capitalize: $("#capitalize"),
    addNumber: $("#addNumber"),
    addSymbol: $("#addSymbol"),

    pinLength: $("#pinLength"),
    pinLengthValue: $("#pinLengthValue"),

    count: $("#count"),
    countValue: $("#countValue"),
    presets: $("#presets"),

    bulk: $("#bulk"),
    bulkTitle: $("#bulkTitle"),
    passwordList: $("#passwordList"),
    copyAllBtn: $("#copyAllBtn"),
    downloadBtn: $("#downloadBtn"),

    historyCard: $("#historyCard"),
    historyList: $("#historyList"),
    clearHistoryBtn: $("#clearHistoryBtn"),

    checkInput: $("#checkInput"),
    checkRevealBtn: $("#checkRevealBtn"),
    checkMeter: $("#checkMeter"),
    checkMeterTrack: $("#checkMeterTrack"),
    checkFindings: $("#checkFindings"),

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
  };

  // When the clipboard should be wiped (ms timestamp), or 0 for never.
  let clipboardDue = 0;
  let clipboardTimer = null;

  /* ------------------------------------------------------------ generation */

  function readOptions() {
    return {
      mode: state.mode,
      length: clamp(parseInt(el.length.value, 10) || 15, 4, 128),
      count: clamp(parseInt(el.count.value, 10) || 1, 1, 50),
      uppercase: el.uppercase.checked,
      lowercase: el.lowercase.checked,
      numbers: el.numbers.checked,
      symbols: el.symbols.checked,
      requireEach: el.requireEach.checked,
      excludeAmbiguous: el.excludeAmbiguous.checked,
      noRepeats: el.noRepeats.checked,
      excludeChars: el.excludeChars.value,
      words: clamp(parseInt(el.wordCount.value, 10) || 6, 3, 12),
      separator: el.separator.value,
      capitalize: el.capitalize.checked,
      addNumber: el.addNumber.checked,
      addSymbol: el.addSymbol.checked,
      pinLength: clamp(parseInt(el.pinLength.value, 10) || 6, 3, 16),
    };
  }

  function makerFor(mode) {
    if (mode === "passphrase") return core.makePassphrase;
    if (mode === "pin") return core.makePin;
    return core.makePassword;
  }

  /**
   * @param {{remember?: boolean}} [config] remember=true adds the result to the
   * session list. Slider-driven regenerations deliberately do not, or the list
   * would fill with values the user never looked at.
   */
  function generate(config) {
    const remember = !!(config && config.remember);

    if (!core || !core.hasCrypto) {
      showError(
        "This browser has no secure random number generator, so FortiPass will not generate a password."
      );
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
          showError(next.error);
          return;
        }
        if (i === 0) first = next;
        results.push(next.value);
      }
    } catch (err) {
      showError("Generation failed with these options — try relaxing them.");
      return;
    }

    state.results = results;

    renderResults();
    updateMeter(first.entropy);
    if (remember) pushHistory(first.value);
    saveSettings();

    const nouns = NOUNS[opts.mode];
    const score = core.scoreFromBits(first.entropy);
    announce(
      "Generated " +
        (opts.count > 1 ? opts.count + " " + nouns[1] : "a new " + nouns[0]) +
        ". Strength " +
        core.SCORE_LABELS[score].toLowerCase() +
        ", " +
        Math.round(first.entropy) +
        " bits."
    );
  }

  /** Regenerate one row of a bulk result without touching the others. */
  function regenerateAt(index) {
    const opts = readOptions();
    let result;
    try {
      result = makerFor(opts.mode)(opts);
    } catch (err) {
      result = { error: "Generation failed with these options." };
    }
    if (result.error) {
      showError(result.error);
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

    if (index === 0) {
      renderHero();
      updateMeter(result.entropy);
    }
  }

  /* ------------------------------------------------------------- rendering */

  function charClass(ch) {
    if (ch === " ") return "ch ch-space";
    if (ch >= "0" && ch <= "9") return "ch ch-digit";
    if (/[a-z]/i.test(ch)) return "ch ch-letter";
    return "ch ch-symbol";
  }

  /** Paints a value one character at a time so digits and symbols stand out. */
  function paint(target, value) {
    target.textContent = "";
    if (state.masked) {
      target.classList.add("is-masked");
      target.textContent = "•".repeat(Math.min(value.length, 40));
      return;
    }
    target.classList.remove("is-masked");
    const frag = document.createDocumentFragment();
    for (const ch of value) {
      const span = document.createElement("span");
      span.className = charClass(ch);
      // A no-break space keeps a space separator visible at a line edge.
      span.textContent = ch === " " ? "\u00A0" : ch;
      frag.appendChild(span);
    }
    target.appendChild(frag);
  }

  function renderHero() {
    const primary = state.results[0] || "";
    const noun = NOUNS[state.mode][0];
    el.hero.classList.remove("is-error");
    el.hero.disabled = false;
    paint(el.hero, primary);
    // Unmasked, the button's own text is its name, so screen readers can
    // read the value. Masked, the bullets would be read out, so describe it.
    if (state.masked) {
      el.hero.setAttribute(
        "aria-label",
        "Hidden " + noun + ", " + primary.length + " characters. Click to copy."
      );
    } else {
      el.hero.removeAttribute("aria-label");
    }
    el.heroHint.textContent = "Click the " + noun + " to copy it.";
    flash(el.hero);
  }

  function renderBulk() {
    el.passwordList.textContent = "";
    if (state.results.length > 1) {
      el.bulk.hidden = false;
      el.bulkTitle.textContent = state.results.length + " generated";
      state.results.forEach((value, index) => {
        el.passwordList.appendChild(buildRow(value, index, true));
      });
    } else {
      el.bulk.hidden = true;
    }
  }

  function renderResults() {
    renderHero();
    renderBulk();
  }

  function buildRow(value, index, animate) {
    const li = document.createElement("li");
    li.className = "password-row";
    if (animate) li.style.animationDelay = Math.min(index * 25, 400) + "ms";
    else li.classList.add("is-static");

    const idx = document.createElement("span");
    idx.className = "row-index";
    idx.textContent = index + 1;

    const text = document.createElement("button");
    text.type = "button";
    text.className = "row-text";
    text.title = "Click to copy";
    paint(text, value);
    if (state.masked) {
      text.setAttribute("aria-label", "Hidden value " + (index + 1) + ". Click to copy.");
    }

    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.appendChild(
      iconButton("i-refresh", "Generate a replacement", () => regenerateAt(index))
    );
    const copyBtn = iconButton("i-copy", "Copy", () =>
      copyWithFeedback(value, copyBtn, "i-copy")
    );
    actions.appendChild(copyBtn);

    text.addEventListener("click", () =>
      copyWithFeedback(value, copyBtn, "i-copy")
    );

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
      '<svg class="icon icon-sm" aria-hidden="true"><use href="#' +
      iconId +
      '"/></svg>';
    button.addEventListener("click", onClick);
    return button;
  }

  function flash(node) {
    node.classList.remove("is-flash");
    // Force a reflow so the animation restarts on every generation.
    void node.offsetWidth;
    node.classList.add("is-flash");
  }

  function showError(message) {
    state.results = [];
    el.hero.classList.add("is-error");
    el.hero.classList.remove("is-masked");
    el.hero.removeAttribute("aria-label");
    el.hero.textContent = message;
    el.hero.disabled = true;
    el.bulk.hidden = true;
    el.passwordList.textContent = "";
    setMeter(el.meter, el.meterTrack, 0, "Not generated", "—", "—");
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

  function updateMeter(bits) {
    const score = core.scoreFromBits(bits);
    setMeter(
      el.meter,
      el.meterTrack,
      score,
      core.SCORE_LABELS[score],
      Math.round(bits) + " bits",
      core.formatCrackTime(bits) + " to crack"
    );
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
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:-1000px;opacity:0;";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (err) {
      return false;
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
      clipboardDue
        ? "Copied — the clipboard clears in " + CLIPBOARD_CLEAR_MS / 1000 + " s"
        : "Copied to clipboard",
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
    if (label) label.textContent = "Copied";

    clearTimeout(button._resetTimer);
    button._resetTimer = setTimeout(() => {
      button.classList.remove("is-done");
      if (use) use.setAttribute("href", "#" + restoreIcon);
      if (label && previousLabel !== null) label.textContent = previousLabel;
    }, 1600);
  }

  function openCopyDialog(text) {
    el.copyDialogText.value = text;
    el.copyDialogText.rows = clamp(text.split("\n").length, 1, 8);
    if (!el.copyDialog.open) el.copyDialog.showModal();
    el.copyDialogText.focus();
    el.copyDialogText.select();
  }

  function scheduleClipboardClear() {
    clearTimeout(clipboardTimer);
    clipboardDue = 0;
    if (!el.clearClipboard.checked) return;
    clipboardDue = Date.now() + CLIPBOARD_CLEAR_MS;
    clipboardTimer = setTimeout(clearClipboardNow, CLIPBOARD_CLEAR_MS);
  }

  function cancelClipboardClear() {
    clearTimeout(clipboardTimer);
    clipboardDue = 0;
  }

  /**
   * Browsers only allow clipboard writes from the focused tab. If the timer
   * fires while the user is in another app, this runs again when they return.
   */
  async function clearClipboardNow() {
    if (!clipboardDue || Date.now() < clipboardDue) return;
    if (!navigator.clipboard || !document.hasFocus()) return;
    try {
      await navigator.clipboard.writeText("");
      clipboardDue = 0;
      toast("Clipboard cleared", "info");
    } catch (err) {
      /* still not allowed — try again on the next focus */
    }
  }

  function download() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const header =
      "# FortiPass — generated " +
      new Date().toLocaleString() +
      "\n# Store these in a password manager and delete this file.\n\n";
    const blob = new Blob([header + state.results.join("\n") + "\n"], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fortipass-" + stamp + ".txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Saved as a text file — delete it once stored safely", "info");
  }

  /* ---------------------------------------------------------------- history */

  function pushHistory(value) {
    if (!value) return;
    const existing = state.history.findIndex((entry) => entry.value === value);
    if (existing === 0) return;
    // Copying an older entry moves it to the top instead of duplicating it.
    if (existing > 0) state.history.splice(existing, 1);
    state.history.unshift({ value: value, time: new Date() });
    if (state.history.length > HISTORY_LIMIT) state.history.pop();
    renderHistory();
  }

  function renderHistory() {
    el.historyCard.hidden = state.history.length === 0;
    el.historyList.textContent = "";

    state.history.forEach((entry, index) => {
      const li = document.createElement("li");
      li.className = "password-row";
      li.style.animationDelay = Math.min(index * 25, 300) + "ms";

      const time = document.createElement("span");
      time.className = "history-time";
      time.textContent = entry.time.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const text = document.createElement("button");
      text.type = "button";
      text.className = "row-text";
      text.title = "Click to copy";
      paint(text, entry.value);
      if (state.masked) {
        text.setAttribute("aria-label", "Hidden value from " + time.textContent + ". Click to copy.");
      }

      const actions = document.createElement("div");
      actions.className = "row-actions";
      const copyBtn = iconButton("i-copy", "Copy", () =>
        copyWithFeedback(entry.value, copyBtn, "i-copy")
      );
      actions.appendChild(copyBtn);
      text.addEventListener("click", () =>
        copyWithFeedback(entry.value, copyBtn, "i-copy")
      );

      li.appendChild(time);
      li.appendChild(text);
      li.appendChild(actions);
      el.historyList.appendChild(li);
    });
  }

  /* ------------------------------------------------------- strength checker */

  function runCheck() {
    const password = el.checkInput.value;

    if (!password) {
      setMeter(
        el.checkMeter,
        el.checkMeterTrack,
        0,
        "Waiting for input",
        "—",
        "—"
      );
      el.checkFindings.textContent = "";
      return;
    }

    const result = core.analyze(password);
    setMeter(
      el.checkMeter,
      el.checkMeterTrack,
      result.score,
      core.SCORE_LABELS[result.score],
      Math.round(result.bits) + " bits",
      core.formatCrackTime(result.bits) + " to crack"
    );

    el.checkFindings.textContent = "";
    result.findings.forEach((finding) => {
      const li = document.createElement("li");
      li.className = "finding finding-" + finding[0];
      const icon = finding[0] === "good" ? "i-check" : "i-warning";
      li.innerHTML =
        '<svg class="icon icon-sm" aria-hidden="true"><use href="#' +
        icon +
        '"/></svg>';
      const span = document.createElement("span");
      span.textContent = finding[1];
      li.appendChild(span);
      el.checkFindings.appendChild(li);
    });
  }

  /* ----------------------------------------------------------------- toasts */

  function toast(message, kind) {
    const node = document.createElement("div");
    node.className = "toast toast-" + (kind || "info");
    const icon =
      kind === "success" ? "i-check" : kind === "error" ? "i-warning" : "i-shield";
    node.innerHTML =
      '<svg class="icon icon-sm" aria-hidden="true"><use href="#' +
      icon +
      '"/></svg>';
    const span = document.createElement("span");
    span.textContent = message;
    node.appendChild(span);
    el.toasts.appendChild(node);

    setTimeout(() => {
      node.classList.add("is-leaving");
      setTimeout(() => node.remove(), 240);
    }, kind === "error" ? 4200 : 2200);
  }

  function announce(message) {
    el.liveStatus.textContent = message;
  }

  /* ------------------------------------------------------------------ theme */

  function effectiveTheme() {
    if (document.documentElement.dataset.theme) {
      return document.documentElement.dataset.theme;
    }
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* private mode — the theme simply will not persist */
    }
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.removeAttribute("media");
      meta.setAttribute("content", theme === "light" ? "#f4f6fc" : "#0b1020");
    });
  }

  function toggleTheme() {
    setTheme(effectiveTheme() === "light" ? "dark" : "light");
  }

  /* --------------------------------------------------------------- settings */

  function saveSettings() {
    const opts = readOptions();
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          mode: state.mode,
          length: opts.length,
          count: opts.count,
          uppercase: opts.uppercase,
          lowercase: opts.lowercase,
          numbers: opts.numbers,
          symbols: opts.symbols,
          requireEach: opts.requireEach,
          excludeAmbiguous: opts.excludeAmbiguous,
          noRepeats: opts.noRepeats,
          excludeChars: opts.excludeChars,
          words: opts.words,
          separator: opts.separator,
          capitalize: opts.capitalize,
          addNumber: opts.addNumber,
          addSymbol: opts.addSymbol,
          pinLength: opts.pinLength,
          clearClipboard: el.clearClipboard.checked,
        })
      );
    } catch (err) {
      /* storage unavailable — settings just will not be remembered */
    }
  }

  function loadSettings() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    } catch (err) {
      saved = null;
    }
    if (!saved || typeof saved !== "object") return;

    const bool = (value, fallback) =>
      typeof value === "boolean" ? value : fallback;
    const int = (value, fallback, min, max) =>
      clamp(parseInt(value, 10) || fallback, min, max);

    if (MODES.indexOf(saved.mode) !== -1) state.mode = saved.mode;
    setLength(int(saved.length, 15, 4, 128));
    el.count.value = int(saved.count, 1, 1, 50);
    el.uppercase.checked = bool(saved.uppercase, true);
    el.lowercase.checked = bool(saved.lowercase, true);
    el.numbers.checked = bool(saved.numbers, true);
    el.symbols.checked = bool(saved.symbols, true);
    el.requireEach.checked = bool(saved.requireEach, true);
    el.excludeAmbiguous.checked = bool(saved.excludeAmbiguous, false);
    el.noRepeats.checked = bool(saved.noRepeats, false);
    el.excludeChars.value =
      typeof saved.excludeChars === "string" ? saved.excludeChars.slice(0, 60) : "";
    el.wordCount.value = int(saved.words, 6, 3, 12);
    if (
      typeof saved.separator === "string" &&
      Array.from(el.separator.options).some((o) => o.value === saved.separator)
    ) {
      el.separator.value = saved.separator;
    }
    el.capitalize.checked = bool(saved.capitalize, true);
    el.addNumber.checked = bool(saved.addNumber, true);
    el.addSymbol.checked = bool(saved.addSymbol, false);
    el.pinLength.value = int(saved.pinLength, 6, 3, 16);
    el.clearClipboard.checked = bool(saved.clearClipboard, false);

    if (
      el.excludeAmbiguous.checked ||
      el.noRepeats.checked ||
      el.excludeChars.value
    ) {
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

  function syncTabs() {
    el.tabs.forEach((tab) => {
      const active = tab.dataset.mode === state.mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    Object.keys(el.panels).forEach((key) => {
      el.panels[key].hidden = key !== state.mode;
    });
  }

  function switchMode(mode) {
    state.mode = mode;
    syncTabs();
    generate();
  }

  /** A preset chip only stays lit while the options still match it. */
  function clearPresetHighlight() {
    Array.from(el.presets.children).forEach((chip) =>
      chip.classList.remove("is-active")
    );
  }

  function userSwitchMode(mode) {
    clearPresetHighlight();
    switchMode(mode);
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;

    if (preset.length) setLength(preset.length);
    if (preset.wordCount) el.wordCount.value = preset.wordCount;
    if (preset.pinLength) el.pinLength.value = preset.pinLength;
    if (preset.separator !== undefined) el.separator.value = preset.separator;
    if (preset.count) el.count.value = preset.count;

    [
      "uppercase",
      "lowercase",
      "numbers",
      "symbols",
      "requireEach",
      "excludeAmbiguous",
      "noRepeats",
      "capitalize",
      "addNumber",
      "addSymbol",
    ].forEach((key) => {
      if (typeof preset[key] === "boolean") el[key].checked = preset[key];
    });

    Array.from(el.presets.children).forEach((chip) =>
      chip.classList.toggle("is-active", chip.dataset.preset === name)
    );

    syncSliders();
    switchMode(preset.mode);
  }

  function syncSliders() {
    el.wordCountValue.value = el.wordCount.value;
    el.pinLengthValue.value = el.pinLength.value;
    el.countValue.value = el.count.value;

    document.querySelectorAll('input[type="range"]').forEach((range) => {
      const min = parseFloat(range.min || 0);
      const max = parseFloat(range.max || 100);
      const percent = ((parseFloat(range.value) - min) / (max - min)) * 100;
      range.style.setProperty("--fill", percent + "%");
    });
  }

  function toggleMask(force) {
    state.masked = typeof force === "boolean" ? force : !state.masked;
    el.maskBtn.setAttribute("aria-pressed", String(state.masked));
    el.maskBtn.querySelector("use").setAttribute(
      "href",
      state.masked ? "#i-eye" : "#i-eye-off"
    );
    el.maskBtn.querySelector(".btn-label").textContent = state.masked
      ? "Show"
      : "Hide";
    if (state.results.length) renderResults();
    renderHistory();
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
      ["checkbox", "radio", "range", "button", "submit", "reset", "color"].indexOf(
        target.type
      ) === -1
    );
  }

  function onDialogBackdropClick(dialog) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  /* ---------------------------------------------------------------- wiring */

  function bindEvents() {
    el.generateBtn.addEventListener("click", () => generate({ remember: true }));

    el.refreshBtn.addEventListener("click", () => {
      const icon = el.refreshBtn.querySelector(".icon");
      icon.classList.remove("icon-spin");
      void icon.offsetWidth;
      icon.classList.add("icon-spin");
      generate({ remember: true });
    });

    el.copyBtn.addEventListener("click", () =>
      copyWithFeedback(state.results[0], el.copyBtn, "i-copy")
    );

    el.hero.addEventListener("click", () =>
      copyWithFeedback(state.results[0], el.copyBtn, "i-copy")
    );

    el.maskBtn.addEventListener("click", () => toggleMask());

    el.clearClipboard.addEventListener("change", () => {
      if (!el.clearClipboard.checked) cancelClipboardClear();
      saveSettings();
    });

    el.tabs.forEach((tab) => {
      tab.addEventListener("click", () => userSwitchMode(tab.dataset.mode));
    });

    // WAI-ARIA tabs: only the active tab is in the Tab order, and the arrow
    // keys, Home and End move between tabs.
    el.tablist.addEventListener("keydown", (event) => {
      const index = el.tabs.indexOf(document.activeElement);
      if (index === -1) return;
      let next = null;
      if (event.key === "ArrowRight") next = (index + 1) % el.tabs.length;
      else if (event.key === "ArrowLeft")
        next = (index - 1 + el.tabs.length) % el.tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = el.tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      userSwitchMode(el.tabs[next].dataset.mode);
      el.tabs[next].focus();
    });

    // Sliders regenerate live; the number field waits for a committed value.
    [el.lengthRange, el.wordCount, el.pinLength, el.count].forEach((range) => {
      range.addEventListener("input", () => {
        if (range === el.lengthRange) el.length.value = range.value;
        clearPresetHighlight();
        syncSliders();
        generate();
      });
    });

    el.length.addEventListener("change", () => {
      setLength(clamp(parseInt(el.length.value, 10) || 15, 4, 128));
      clearPresetHighlight();
      syncSliders();
      generate();
    });

    el.length.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        el.length.blur();
      }
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
      el.capitalize,
      el.addNumber,
      el.addSymbol,
    ].forEach((input) =>
      input.addEventListener("change", () => {
        clearPresetHighlight();
        generate();
      })
    );

    const generateSoon = debounce(generate, 350);
    el.excludeChars.addEventListener("input", () => {
      clearPresetHighlight();
      generateSoon();
    });

    el.presets.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (chip) applyPreset(chip.dataset.preset);
    });

    el.copyAllBtn.addEventListener("click", () =>
      copyWithFeedback(state.results.join("\n"), el.copyAllBtn, "i-copy")
    );
    el.downloadBtn.addEventListener("click", download);

    el.clearHistoryBtn.addEventListener("click", () => {
      state.history = [];
      renderHistory();
      toast("Session list cleared", "info");
    });

    el.checkInput.addEventListener("input", debounce(runCheck, 140));
    el.checkRevealBtn.addEventListener("click", () => {
      const revealed = el.checkInput.type === "text";
      el.checkInput.type = revealed ? "password" : "text";
      el.checkRevealBtn.setAttribute("aria-pressed", String(!revealed));
      el.checkRevealBtn.setAttribute(
        "aria-label",
        revealed ? "Show password" : "Hide password"
      );
      el.checkRevealBtn
        .querySelector("use")
        .setAttribute("href", revealed ? "#i-eye" : "#i-eye-off");
    });

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
      // (Czech, French…) work too.
      const digit = /^(?:Digit|Numpad)([1-3])$/.exec(event.code || "");
      if (digit) {
        userSwitchMode(MODES[Number(digit[1]) - 1]);
        return;
      }

      const key = (event.key || "").toLowerCase();
      if (key === "g") {
        event.preventDefault();
        generate({ remember: true });
      } else if (key === "c") {
        copyWithFeedback(state.results[0], el.copyBtn, "i-copy");
      } else if (key === "h") {
        toggleMask();
      } else if (key === "t") {
        toggleTheme();
      } else if (event.key === "?") {
        el.dialog.showModal();
      }
    });

    window.addEventListener("focus", clearClipboardNow);

    // Leaving the page (or parking it in the back/forward cache) wipes what
    // the session list and the checker were holding, as the page promises.
    window.addEventListener("pagehide", () => {
      state.history = [];
      renderHistory();
      el.checkInput.value = "";
      runCheck();
      if (el.copyDialog.open) el.copyDialog.close();
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) generate();
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

    loadSettings();

    // App shortcuts (./?mode=passphrase) win over the remembered mode.
    const requestedMode = new URLSearchParams(location.search).get("mode");
    if (MODES.indexOf(requestedMode) !== -1) state.mode = requestedMode;

    syncSliders();
    bindEvents();
    syncTabs();
    generate();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
