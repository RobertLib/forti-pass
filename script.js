/* ==========================================================================
   FortiPass — password, passphrase and PIN generator
   Everything runs locally. Randomness comes from the Web Crypto API.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------------------------------------------------------------- config */

  const CHARS = {
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    numbers: "0123456789",
    symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?/~",
  };

  // Characters that are easy to confuse when read aloud or typed from a screen.
  const AMBIGUOUS = "Il1|O0oB8S5Z2G6'\"`";

  const PASSPHRASE_SYMBOLS = "!@#$%&*?+=";

  // Offline attack on a poorly hashed password: 10^11 guesses per second.
  const GUESSES_PER_SECOND = 1e11;
  const LOG10_2 = Math.log10(2);
  const SECONDS_PER_YEAR = 3.15576e7;

  const SCORE_LABELS = [
    "",
    "Very weak",
    "Weak",
    "Fair",
    "Strong",
    "Excellent",
  ];

  // wordlist.js declares WORDS as a top-level const, which is a lexical global
  // rather than a property of window — hence the typeof guard.
  const wordList =
    typeof WORDS !== "undefined" && Array.isArray(WORDS) ? WORDS : [];

  const HISTORY_LIMIT = 12;
  const SETTINGS_KEY = "fortipass:settings:v1";
  const THEME_KEY = "fortipass:theme";

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
    tabs: Array.from(document.querySelectorAll(".tab")),
    panels: {
      password: $("#panel-password"),
      passphrase: $("#panel-passphrase"),
      pin: $("#panel-pin"),
    },
    hero: $("#heroPassword"),
    maskBtn: $("#maskBtn"),
    refreshBtn: $("#refreshBtn"),
    copyBtn: $("#copyBtn"),
    generateBtn: $("#generateBtn"),
    meter: $("#meter"),
    meterTrack: $("#meterTrack"),
    strengthLabel: $("#strengthLabel"),
    entropyText: $("#entropyText"),
    crackText: $("#crackText"),
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
    checkVerdict: $("#checkVerdict"),
    checkEntropy: $("#checkEntropy"),
    checkCrack: $("#checkCrack"),
    checkFindings: $("#checkFindings"),

    themeBtn: $("#themeBtn"),
    shortcutsBtn: $("#shortcutsBtn"),
    dialog: $("#shortcutsDialog"),
    closeDialogBtn: $("#closeDialogBtn"),
    toasts: $("#toasts"),
  };

  /* ----------------------------------------------------------------- state */

  const state = {
    mode: "password",
    masked: false,
    results: [],
    history: [],
  };

  /* ------------------------------------------------------------ randomness */

  const cryptoObj = window.crypto || window.msCrypto;
  const hasCrypto =
    !!cryptoObj && typeof cryptoObj.getRandomValues === "function";

  /**
   * Uniform random integer in [0, max) using rejection sampling, so there is
   * no modulo bias. Never falls back to Math.random() — a biased generator is
   * worse than an honest failure for a security tool.
   */
  function randomInt(max) {
    if (max <= 0) throw new RangeError("max must be > 0");
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    let value;
    do {
      cryptoObj.getRandomValues(buf);
      value = buf[0];
    } while (value >= limit);
    return value % max;
  }

  function pick(source) {
    return source[randomInt(source.length)];
  }

  /** Fisher-Yates shuffle driven by the CSPRNG. */
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

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

  function buildCharacterSets(opts) {
    const banned = new Set(opts.excludeChars.split(""));
    if (opts.excludeAmbiguous) {
      AMBIGUOUS.split("").forEach((c) => banned.add(c));
    }

    const wanted = [
      opts.uppercase && CHARS.uppercase,
      opts.lowercase && CHARS.lowercase,
      opts.numbers && CHARS.numbers,
      opts.symbols && CHARS.symbols,
    ].filter(Boolean);

    return wanted
      .map((set) =>
        Array.from(new Set(set.split(""))).filter((c) => !banned.has(c))
      )
      .filter((set) => set.length > 0);
  }

  function makePassword(opts) {
    const sets = buildCharacterSets(opts);
    if (!sets.length) {
      return { error: "Select at least one character type." };
    }

    const pool = Array.from(new Set([].concat.apply([], sets)));

    if (opts.noRepeats && opts.length > pool.length) {
      return {
        error:
          "Only " +
          pool.length +
          " unique characters available — shorten the password or allow repeats.",
      };
    }

    const useEach = opts.requireEach && opts.length >= sets.length;
    const chars = [];

    if (opts.noRepeats) {
      const available = pool.slice();
      const take = (candidates) => {
        const options = candidates.filter((c) => available.indexOf(c) !== -1);
        const chosen = pick(options);
        available.splice(available.indexOf(chosen), 1);
        return chosen;
      };
      if (useEach) sets.forEach((set) => chars.push(take(set)));
      while (chars.length < opts.length) chars.push(take(available.slice()));
    } else {
      if (useEach) sets.forEach((set) => chars.push(pick(set)));
      while (chars.length < opts.length) chars.push(pick(pool));
    }

    let entropy;
    if (opts.noRepeats) {
      entropy = 0;
      for (let i = 0; i < opts.length; i++) {
        entropy += Math.log2(pool.length - i);
      }
    } else {
      entropy = opts.length * Math.log2(pool.length);
    }

    return { value: shuffle(chars).join(""), entropy: entropy };
  }

  function makePassphrase(opts) {
    if (wordList.length < 100) {
      return { error: "Word list failed to load — reload the page." };
    }

    const words = [];
    for (let i = 0; i < opts.words; i++) {
      const word = wordList[randomInt(wordList.length)];
      words.push(
        opts.capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word
      );
    }

    let entropy = opts.words * Math.log2(wordList.length);
    let value;

    if (opts.separator === "digit") {
      value = words.reduce(
        (acc, word, i) => (i === 0 ? word : acc + randomInt(10) + word)
      );
      entropy += (opts.words - 1) * Math.log2(10);
    } else {
      value = words.join(opts.separator);
    }

    if (opts.addNumber) {
      value += String(randomInt(10));
      entropy += Math.log2(10);
    }
    if (opts.addSymbol) {
      value += pick(PASSPHRASE_SYMBOLS);
      entropy += Math.log2(PASSPHRASE_SYMBOLS.length);
    }

    return { value: value, entropy: entropy };
  }

  function makePin(opts) {
    let value = "";
    for (let i = 0; i < opts.pinLength; i++) value += randomInt(10);
    return { value: value, entropy: opts.pinLength * Math.log2(10) };
  }

  /**
   * @param {{remember?: boolean}} [config] remember=true adds the result to the
   * session list. Slider-driven regenerations deliberately do not, or the list
   * would fill with values the user never looked at.
   */
  function generate(config) {
    const remember = !!(config && config.remember);

    if (!hasCrypto) {
      showError(
        "This browser has no secure random number generator, so FortiPass will not generate a password."
      );
      return;
    }

    const opts = readOptions();
    const make =
      opts.mode === "passphrase"
        ? makePassphrase
        : opts.mode === "pin"
        ? makePin
        : makePassword;

    let first;
    const results = [];
    try {
      first = make(opts);
      if (first.error) {
        showError(first.error);
        return;
      }
      results.push(first.value);
      for (let i = 1; i < opts.count; i++) {
        const next = make(opts);
        if (next.error) {
          showError(next.error);
          return;
        }
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

    const score = scoreFromBits(first.entropy);
    announce(
      "Generated " +
        (opts.count > 1 ? opts.count + " " + opts.mode + "s" : "a new " + opts.mode) +
        ". Strength " +
        SCORE_LABELS[score].toLowerCase() +
        ", " +
        Math.round(first.entropy) +
        " bits."
    );
  }

  /** Regenerate one row of a bulk result without touching the others. */
  function regenerateAt(index) {
    const opts = readOptions();
    const make =
      opts.mode === "passphrase"
        ? makePassphrase
        : opts.mode === "pin"
        ? makePin
        : makePassword;

    let result;
    try {
      result = make(opts);
    } catch (err) {
      result = { error: "Generation failed with these options." };
    }
    if (result.error) {
      showError(result.error);
      return;
    }
    state.results[index] = result.value;
    if (index === 0) updateMeter(result.entropy);
    renderResults();
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
      span.textContent = ch === " " ? " " : ch;
      frag.appendChild(span);
    }
    target.appendChild(frag);
  }

  function renderResults() {
    const primary = state.results[0] || "";
    el.hero.classList.remove("is-error");
    el.hero.disabled = false;
    paint(el.hero, primary);
    el.hero.setAttribute(
      "aria-label",
      "Generated " + state.mode + ", " + primary.length + " characters. Click to copy."
    );

    flash(el.hero);

    if (state.results.length > 1) {
      el.bulk.hidden = false;
      el.bulkTitle.textContent = state.results.length + " generated";
      el.passwordList.textContent = "";
      state.results.forEach((value, index) => {
        el.passwordList.appendChild(buildRow(value, index));
      });
    } else {
      el.bulk.hidden = true;
      el.passwordList.textContent = "";
    }
  }

  function buildRow(value, index) {
    const li = document.createElement("li");
    li.className = "password-row";
    li.style.animationDelay = Math.min(index * 25, 400) + "ms";

    const idx = document.createElement("span");
    idx.className = "row-index";
    idx.textContent = index + 1;

    const text = document.createElement("button");
    text.type = "button";
    text.className = "row-text";
    text.title = "Click to copy";
    paint(text, value);

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
    el.hero.textContent = message;
    el.hero.disabled = true;
    el.bulk.hidden = true;
    setMeter(el.meter, el.meterTrack, 0, "Not generated", "—", "—");
    toast(message, "error");
  }

  /* ---------------------------------------------------------------- metrics */

  function scoreFromBits(bits) {
    if (bits < 30) return 1;
    if (bits < 50) return 2;
    if (bits < 70) return 3;
    if (bits < 90) return 4;
    return 5;
  }

  function formatCrackTime(bits) {
    if (!isFinite(bits) || bits <= 0) return "instantly";

    // Average work is half the keyspace; stay in log space so huge keyspaces
    // do not overflow to Infinity.
    const log10Seconds = (bits - 1) * LOG10_2 - Math.log10(GUESSES_PER_SECOND);

    if (log10Seconds < 0) return "instantly";

    const log10Years = log10Seconds - Math.log10(SECONDS_PER_YEAR);
    if (log10Years >= 18) return "10^" + Math.round(log10Years) + " years";

    const seconds = Math.pow(10, log10Seconds);
    if (seconds < 60) return Math.round(seconds) + " seconds";
    const minutes = seconds / 60;
    if (minutes < 60) return Math.round(minutes) + " minutes";
    const hours = minutes / 60;
    if (hours < 24) return Math.round(hours) + " hours";
    const days = hours / 24;
    if (days < 365) return Math.round(days) + " days";

    const years = seconds / SECONDS_PER_YEAR;
    if (years < 1e3) return Math.round(years) + " years";
    if (years < 1e6) return round1(years / 1e3) + " thousand years";
    if (years < 1e9) return round1(years / 1e6) + " million years";
    if (years < 1e12) return round1(years / 1e9) + " billion years";
    if (years < 1e15) return round1(years / 1e12) + " trillion years";
    return round1(years / 1e15) + " quadrillion years";
  }

  function setMeter(meter, track, score, label, bitsText, crackText) {
    meter.dataset.score = String(score);
    track.setAttribute("aria-valuenow", String(score));
    track.setAttribute("aria-valuetext", label);
    meter.querySelector(".strength-label").textContent = label;
    meter.querySelectorAll(".meta-item span")[0].textContent = bitsText;
    meter.querySelectorAll(".meta-item span")[1].textContent = crackText;
  }

  function updateMeter(bits) {
    const score = scoreFromBits(bits);
    setMeter(
      el.meter,
      el.meterTrack,
      score,
      SCORE_LABELS[score],
      Math.round(bits) + " bits",
      formatCrackTime(bits) + " to crack"
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
      toast("Could not reach the clipboard — select and copy manually.", "error");
      return;
    }

    toast("Copied to clipboard", "success");
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
    if (state.history.length && state.history[0].value === value) return;
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

  const COMMON_PASSWORDS = new Set(
    ("123456 password 123456789 12345678 12345 qwerty abc123 111111 123123 1234567890 " +
      "1234567 password1 qwerty123 000000 iloveyou dragon monkey letmein football " +
      "admin welcome login princess sunshine master 123qwe qwertyuiop starwars " +
      "passw0rd zaq12wsx qazwsx trustno1 hello freedom whatever qwe123 asdfgh " +
      "michael jordan superman batman charlie donald hunter shadow ranger " +
      "baseball soccer hockey killer jennifer joshua maggie mustang pepper " +
      "summer winter spring autumn secret ninja azerty 654321 666666 121212 " +
      "abcdef abcd1234 a1b2c3 test test123 guest user root toor changeme " +
      "letmein1 p@ssword p@ssw0rd password123 welcome1 admin123 root123 " +
      "iloveyou1 samsung google chrome firefox internet computer 987654321 " +
      "asdf1234 zxcvbnm 1qaz2wsx 1q2w3e4r 1q2w3e4r5t qwer1234 poiuyt lkjhg " +
      "monkey1 sunshine1 princess1 michael1 love sex god money"
    ).split(/\s+/)
  );

  const KEYBOARD_ROWS = [
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
    "qwertzuiop",
    "azertyuiop",
  ];

  function isSequential(a, b) {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return KEYBOARD_ROWS.some((row) => {
      const i = row.indexOf(x);
      const j = row.indexOf(y);
      return i !== -1 && j !== -1 && Math.abs(i - j) === 1;
    });
  }

  function observedPoolSize(password) {
    let size = 0;
    if (/[a-z]/.test(password)) size += 26;
    if (/[A-Z]/.test(password)) size += 26;
    if (/[0-9]/.test(password)) size += 10;
    if (/[^a-zA-Z0-9]/.test(password)) size += 32;
    return Math.max(size, 2);
  }

  /**
   * A deliberately conservative estimate: runs of repeated or sequential
   * characters contribute far less than independent random ones.
   */
  function effectiveLength(password) {
    let effective = 1;
    for (let i = 1; i < password.length; i++) {
      const prev = password[i - 1];
      const ch = password[i];
      if (ch === prev || isSequential(prev, ch)) effective += 0.35;
      else effective += 1;
    }
    return effective;
  }

  /**
   * Undoes the usual leet substitutions, keeping case so camel-case splitting
   * still works. Cracking rules try exactly these swaps first, so "P@ssw0rd"
   * deserves no more credit than "password".
   */
  function unleet(text) {
    return text
      .replace(/[@4]/g, "a")
      .replace(/0/g, "o")
      .replace(/[1!|]/g, "i")
      .replace(/3/g, "e")
      .replace(/[$5]/g, "s")
      .replace(/7/g, "t")
      .replace(/8/g, "b")
      .replace(/9/g, "g");
  }

  /**
   * Splits a password into candidate words, honouring camel case so that
   * "MyDogRusty" is seen as my / dog / rusty rather than one long token.
   */
  function tokenize(password) {
    const tokens = [];
    (password.match(/[A-Za-z]+/g) || []).forEach((run) => {
      const parts =
        /^[A-Z]+$/.test(run) || /^[a-z]+$/.test(run)
          ? [run]
          : run.split(/(?=[A-Z])/);
      parts.forEach((part) => {
        if (part.length >= 3) tokens.push(part.toLowerCase());
      });
    });
    return tokens;
  }

  /** How many distinct characters sit outside the recognised words. */
  function countDistinctNonWordChars(password, words) {
    let remainder = password;
    words.forEach((word) => {
      const index = remainder.toLowerCase().indexOf(word);
      if (index !== -1) {
        remainder =
          remainder.slice(0, index) + remainder.slice(index + word.length);
      }
    });
    return new Set(remainder.split("")).size;
  }

  function analyze(password) {
    const lower = password.toLowerCase();
    const stripped = lower.replace(/[^a-z]/g, "");
    const pool = observedPoolSize(password);
    let bits = effectiveLength(password) * Math.log2(pool);

    const findings = [];
    const classes = [
      /[a-z]/.test(password),
      /[A-Z]/.test(password),
      /[0-9]/.test(password),
      /[^a-zA-Z0-9]/.test(password),
    ].filter(Boolean).length;

    // Compare against the common-password list the way a cracker would: after
    // undoing leet swaps and stripping a trailing number.
    const trimmed = lower
      .replace(/[^a-z0-9@$]+$/, "")
      .replace(/[0-9]+$/, "");
    const variants = [
      lower,
      stripped,
      trimmed,
      unleet(lower),
      unleet(trimmed),
      unleet(lower).replace(/[^a-z]/g, ""),
    ];

    if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(stripped)) {
      bits = Math.min(bits, 8);
      findings.push([
        "bad",
        "This is one of the most guessed passwords in the world — change it everywhere it is used.",
      ]);
    } else if (
      variants.some((v) => v.length >= 4 && COMMON_PASSWORDS.has(v))
    ) {
      bits = Math.min(bits, 22);
      findings.push([
        "bad",
        "A well-known password dressed up with predictable swaps (@ for a, 0 for o, a number on the end). Cracking tools try those first.",
      ]);
    }

    if (password.length < 8) {
      findings.push([
        "bad",
        "Only " + password.length + " characters. Anything under 8 falls in seconds.",
      ]);
    } else if (password.length < 12) {
      findings.push([
        "warn",
        password.length + " characters is short. Aim for 16 or more.",
      ]);
    } else {
      findings.push(["good", password.length + " characters is a good length."]);
    }

    if (classes <= 2) {
      findings.push([
        "warn",
        "Only " +
          classes +
          " character type" +
          (classes === 1 ? "" : "s") +
          " in use. Mixing upper case, digits and symbols multiplies the search space.",
      ]);
    } else if (classes === 4) {
      findings.push(["good", "Uses all four character types."]);
    }

    if (/(.)\1{2,}/.test(password)) {
      findings.push(["warn", "Contains a character repeated three or more times in a row."]);
    }

    let runLength = 1;
    let longestRun = 1;
    for (let i = 1; i < password.length; i++) {
      if (isSequential(password[i - 1], password[i])) runLength += 1;
      else runLength = 1;
      longestRun = Math.max(longestRun, runLength);
    }
    if (longestRun >= 4) {
      findings.push([
        "warn",
        "Contains a keyboard or alphabet run such as “abc”, “123” or “qwe”.",
      ]);
    }

    if (/(19|20)\d{2}/.test(password)) {
      findings.push(["warn", "Looks like it contains a year — birthdays and dates are guessed early."]);
    }

    // Words are a single guess to a dictionary attack, not a string of
    // independent characters — so score recognised words per word.
    const bitsPerWord = Math.log2(wordList.length || 2);
    // Check both the literal spelling and the un-leeted one, so neither
    // "Elite3" nor "3l1t3" slips past the word list.
    const seenWords = new Set();
    const dictionaryWords = [];
    tokenize(password)
      .concat(tokenize(unleet(password)))
      .forEach((token) => {
        if (wordList.indexOf(token) !== -1 && !seenWords.has(token)) {
          seenWords.add(token);
          dictionaryWords.push(token);
        }
      });
    const dictionaryLetters = dictionaryWords.reduce(
      (total, word) => total + word.length,
      0
    );

    if (dictionaryWords.length && dictionaryLetters >= password.length * 0.5) {
      // Separators repeated between words ("-" four times) are a pattern, not
      // four independent choices, so only distinct leftovers earn full credit.
      const leftovers = password.length - dictionaryLetters;
      const distinctLeftovers = countDistinctNonWordChars(
        password,
        dictionaryWords
      );
      bits = Math.min(
        bits,
        dictionaryWords.length * bitsPerWord +
          distinctLeftovers * Math.log2(pool) +
          Math.max(0, leftovers - distinctLeftovers)
      );
      if (dictionaryWords.length === 1) {
        findings.push([
          "warn",
          "Built around a single dictionary word — a word list cracks that far faster than its length suggests.",
        ]);
      } else {
        findings.push([
          scoreFromBits(bits) >= 4 ? "good" : "warn",
          "Recognised as " +
            dictionaryWords.length +
            " dictionary words, so it is scored per word rather than per character.",
        ]);
      }
    }

    const score = scoreFromBits(bits);
    if (score >= 4 && !findings.some((f) => f[0] !== "good")) {
      findings.push([
        "good",
        "Nothing obvious to improve — just never reuse it on another site.",
      ]);
    }

    // Praise reads as mockery next to a failing verdict, so drop it.
    const relevant =
      score <= 2 ? findings.filter((f) => f[0] !== "good") : findings;

    return { bits: bits, score: score, findings: relevant.slice(0, 5) };
  }

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

    const result = analyze(password);
    setMeter(
      el.checkMeter,
      el.checkMeterTrack,
      result.score,
      SCORE_LABELS[result.score],
      Math.round(result.bits) + " bits",
      formatCrackTime(result.bits) + " to crack"
    );

    el.checkFindings.textContent = "";
    result.findings.forEach((finding) => {
      const li = document.createElement("li");
      li.className = "finding finding-" + finding[0];
      const icon =
        finding[0] === "good"
          ? "i-check"
          : finding[0] === "bad"
          ? "i-warning"
          : "i-warning";
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

    if (["password", "passphrase", "pin"].indexOf(saved.mode) !== -1) {
      state.mode = saved.mode;
    }
    setLength(clamp(saved.length || 15, 4, 128));
    el.count.value = clamp(saved.count || 1, 1, 50);
    el.uppercase.checked = bool(saved.uppercase, true);
    el.lowercase.checked = bool(saved.lowercase, true);
    el.numbers.checked = bool(saved.numbers, true);
    el.symbols.checked = bool(saved.symbols, true);
    el.requireEach.checked = bool(saved.requireEach, true);
    el.excludeAmbiguous.checked = bool(saved.excludeAmbiguous, false);
    el.noRepeats.checked = bool(saved.noRepeats, false);
    el.excludeChars.value =
      typeof saved.excludeChars === "string" ? saved.excludeChars.slice(0, 60) : "";
    el.wordCount.value = clamp(saved.words || 6, 3, 12);
    if (
      typeof saved.separator === "string" &&
      Array.from(el.separator.options).some((o) => o.value === saved.separator)
    ) {
      el.separator.value = saved.separator;
    }
    el.capitalize.checked = bool(saved.capitalize, true);
    el.addNumber.checked = bool(saved.addNumber, true);
    el.addSymbol.checked = bool(saved.addSymbol, false);
    el.pinLength.value = clamp(saved.pinLength || 6, 3, 16);

    if (
      el.excludeAmbiguous.checked ||
      el.noRepeats.checked ||
      el.excludeChars.value
    ) {
      $("#advanced").open = true;
    }
  }

  /* ------------------------------------------------------------------- misc */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round1(value) {
    return value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  }

  function setLength(value) {
    el.length.value = value;
    el.lengthRange.value = Math.min(value, parseInt(el.lengthRange.max, 10));
  }

  function switchMode(mode) {
    state.mode = mode;
    el.tabs.forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    Object.keys(el.panels).forEach((key) => {
      el.panels[key].hidden = key !== mode;
    });
    generate();
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

    el.tabs.forEach((tab) => {
      tab.addEventListener("click", () => switchMode(tab.dataset.mode));
    });

    // Sliders regenerate live; the number field waits for a committed value.
    [el.lengthRange, el.wordCount, el.pinLength, el.count].forEach((range) => {
      range.addEventListener("input", () => {
        if (range === el.lengthRange) el.length.value = range.value;
        syncSliders();
        generate();
      });
    });

    el.length.addEventListener("change", () => {
      setLength(clamp(parseInt(el.length.value, 10) || 15, 4, 128));
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
    ].forEach((input) => input.addEventListener("change", generate));

    el.excludeChars.addEventListener("input", debounce(generate, 350));

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

    el.themeBtn.addEventListener("click", () => {
      setTheme(effectiveTheme() === "light" ? "dark" : "light");
    });

    el.shortcutsBtn.addEventListener("click", () => el.dialog.showModal());
    el.closeDialogBtn.addEventListener("click", () => el.dialog.close());
    el.dialog.addEventListener("click", (event) => {
      if (event.target === el.dialog) el.dialog.close();
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "g") {
        event.preventDefault();
        generate({ remember: true });
      } else if (key === "c") {
        copyWithFeedback(state.results[0], el.copyBtn, "i-copy");
      } else if (key === "h") {
        toggleMask();
      } else if (key === "t") {
        setTheme(effectiveTheme() === "light" ? "dark" : "light");
      } else if (key === "1" || key === "2" || key === "3") {
        switchMode(["password", "passphrase", "pin"][Number(key) - 1]);
      } else if (event.key === "?") {
        el.dialog.showModal();
      }
    });

    // Leave nothing behind in memory-visible UI when the tab is closed.
    window.addEventListener("pagehide", () => {
      state.history = [];
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
    if (["password", "passphrase", "pin"].indexOf(requestedMode) !== -1) {
      state.mode = requestedMode;
    }

    syncSliders();
    bindEvents();

    el.tabs.forEach((tab) => {
      const active = tab.dataset.mode === state.mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    Object.keys(el.panels).forEach((key) => {
      el.panels[key].hidden = key !== state.mode;
    });

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
