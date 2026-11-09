/* ==========================================================================
   FortiPass core — randomness, generators, entropy maths and the strength
   checker. It never touches the DOM, so the same file runs in the browser
   (as window.FortiPassCore) and under `node --test` (as module.exports).
   ========================================================================== */

(function (root) {
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

  const SCORE_LABELS = ["", "Very weak", "Weak", "Fair", "Strong", "Excellent"];

  const YEAR_SCALES = [
    [1e3, "thousand"],
    [1e6, "million"],
    [1e9, "billion"],
    [1e12, "trillion"],
    [1e15, "quadrillion"],
  ];

  // The checker's pattern search is cubic in the worst case; this bound keeps
  // it instant. The input field enforces the same limit.
  const MAX_CHECK_LENGTH = 256;

  // "Use every type" is enforced by rejection sampling, which needs a handful
  // of tries for any realistic option mix. This only stops a pathological one.
  const MAX_ATTEMPTS = 100000;

  const COMMON_PASSWORDS = new Set(
    (
      "123456 password 123456789 12345678 12345 qwerty abc123 111111 123123 1234567890 " +
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

  // The usual leet swaps. "1" and "|" stand for "i" as often as for "l", so
  // both readings are tried.
  const LEET_I = {
    "@": "a",
    "4": "a",
    "0": "o",
    "3": "e",
    $: "s",
    "5": "s",
    "7": "t",
    "8": "b",
    "9": "g",
    "1": "i",
    "!": "i",
    "|": "i",
  };
  const LEET_L = Object.assign({}, LEET_I, { "1": "l", "|": "l" });

  /* ------------------------------------------------------------------ core */

  /**
   * @param {{crypto?: {getRandomValues: Function}, words?: string[]}} config
   */
  function createCore(config) {
    const cryptoObj = config && config.crypto;
    const wordList = config && Array.isArray(config.words) ? config.words : [];
    const hasCrypto =
      !!cryptoObj && typeof cryptoObj.getRandomValues === "function";

    const WORD_SET = new Set(wordList);
    const WORD_BITS = Math.log2(Math.max(WORD_SET.size, 2));
    // Common passwords that are also passphrase words are scored as list
    // words, so the checker never undercuts a passphrase this app generated.
    const COMMON_ONLY = new Set(
      Array.from(COMMON_PASSWORDS).filter((word) => !WORD_SET.has(word))
    );
    const COMMON_BITS = Math.log2(COMMON_ONLY.size);
    const MAX_TOKEN_LENGTH = Array.from(WORD_SET)
      .concat(Array.from(COMMON_ONLY))
      .reduce((longest, word) => Math.max(longest, word.length), 0);

    /* ------------------------------------------------------- randomness */

    /**
     * Uniform random integer in [0, max) using rejection sampling, so there
     * is no modulo bias. Never falls back to Math.random() — a biased
     * generator is worse than an honest failure for a security tool.
     */
    function randomInt(max) {
      if (!(max > 0)) throw new RangeError("max must be > 0");
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

    /** `count` distinct items, uniformly over ordered selections. */
    function sampleDistinct(pool, count) {
      const copy = pool.slice();
      for (let i = 0; i < count; i++) {
        const j = i + randomInt(copy.length - i);
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy.slice(0, count);
    }

    /* ------------------------------------------------------- generation */

    function buildCharacterSets(opts) {
      const banned = new Set(Array.from(opts.excludeChars || ""));
      if (opts.excludeAmbiguous) {
        Array.from(AMBIGUOUS).forEach((c) => banned.add(c));
      }

      const wanted = [
        opts.uppercase && CHARS.uppercase,
        opts.lowercase && CHARS.lowercase,
        opts.numbers && CHARS.numbers,
        opts.symbols && CHARS.symbols,
      ].filter(Boolean);

      // The four base sets are disjoint, which the entropy maths relies on.
      return wanted
        .map((set) => Array.from(set).filter((c) => !banned.has(c)))
        .filter((set) => set.length > 0);
    }

    function log2Falling(n, k) {
      let bits = 0;
      for (let i = 0; i < k; i++) bits += Math.log2(n - i);
      return bits;
    }

    /**
     * Exact entropy of a password drawn uniformly from every string over the
     * pool (optionally without repeats) that, when `requireEach` is set,
     * contains at least one character of every set. Inclusion–exclusion over
     * the sets that could be missing gives the fraction of strings that pass.
     */
    function passwordEntropy(poolSize, setSizes, length, noRepeats, requireEach) {
      if (noRepeats && length > poolSize) return -Infinity;
      const base = noRepeats
        ? log2Falling(poolSize, length)
        : length * Math.log2(poolSize);
      if (!requireEach || setSizes.length < 2) return base;

      let fraction = 0;
      for (let mask = 0; mask < 1 << setSizes.length; mask++) {
        let excluded = 0;
        let members = 0;
        setSizes.forEach((size, b) => {
          if (mask & (1 << b)) {
            excluded += size;
            members += 1;
          }
        });
        const left = poolSize - excluded;
        let share;
        if (noRepeats) {
          share = left < length ? 0 : 1;
          for (let i = 0; share > 0 && i < length; i++) {
            share *= (left - i) / (poolSize - i);
          }
        } else {
          share = Math.pow(left / poolSize, length);
        }
        fraction += (members % 2 ? -1 : 1) * share;
      }
      return fraction > 0 ? base + Math.log2(fraction) : -Infinity;
    }

    function makePassword(opts) {
      if (!(opts.uppercase || opts.lowercase || opts.numbers || opts.symbols)) {
        return { error: "Select at least one character type." };
      }
      const sets = buildCharacterSets(opts);
      if (!sets.length) {
        return {
          error:
            "Every character of the selected types is excluded — remove some exclusions.",
        };
      }

      const pool = [].concat.apply([], sets);

      if (opts.noRepeats && opts.length > pool.length) {
        return {
          error:
            "Only " +
            pool.length +
            " unique characters available — shorten the password or allow repeats.",
        };
      }

      const useEach =
        !!opts.requireEach && sets.length > 1 && opts.length >= sets.length;
      const entropy = passwordEntropy(
        pool.length,
        sets.map((set) => set.length),
        opts.length,
        !!opts.noRepeats,
        useEach
      );
      if (!isFinite(entropy)) {
        return {
          error: "These options cannot be satisfied — lengthen the password or relax them.",
        };
      }

      const setOf = new Map();
      sets.forEach((set, index) => set.forEach((c) => setOf.set(c, index)));

      // Draw uniformly and reject anything that misses a type. Unlike placing
      // one character of each type and shuffling, this keeps every valid
      // password equally likely, so the entropy above is exact.
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        let chars;
        if (opts.noRepeats) {
          chars = sampleDistinct(pool, opts.length);
        } else {
          chars = [];
          for (let i = 0; i < opts.length; i++) chars.push(pick(pool));
        }

        if (useEach) {
          const seen = new Set(chars.map((c) => setOf.get(c)));
          if (seen.size < sets.length) continue;
        }
        return { value: chars.join(""), entropy: entropy };
      }

      return {
        error:
          "These options are too restrictive — lengthen the password or allow more characters.",
      };
    }

    function makePassphrase(opts) {
      if (wordList.length < 100) {
        return { error: "Word list failed to load — reload the page." };
      }

      const words = [];
      for (let i = 0; i < opts.words; i++) {
        const word = pick(wordList);
        words.push(
          opts.capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word
        );
      }

      let entropy = opts.words * Math.log2(wordList.length);
      let value;

      if (opts.separator === "digit") {
        value = words[0];
        for (let i = 1; i < words.length; i++) {
          value += randomInt(10) + words[i];
        }
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

    /* ---------------------------------------------------------- metrics */

    function scoreFromBits(bits) {
      if (bits < 30) return 1;
      if (bits < 50) return 2;
      if (bits < 70) return 3;
      if (bits < 90) return 4;
      return 5;
    }

    function round1(value) {
      return value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    }

    function countOf(value, unit) {
      const n = Math.round(value);
      return n + " " + unit + (n === 1 ? "" : "s");
    }

    function formatCrackTime(bits) {
      if (!isFinite(bits) || bits <= 0) return "instantly";

      // Average work is half the keyspace; stay in log space so huge
      // keyspaces do not overflow to Infinity.
      const log10Seconds =
        (bits - 1) * LOG10_2 - Math.log10(GUESSES_PER_SECOND);
      if (log10Seconds < 0) return "instantly";

      const log10Years = log10Seconds - Math.log10(SECONDS_PER_YEAR);
      if (log10Years >= 18) return "10^" + Math.round(log10Years) + " years";

      // Each threshold sits half a unit below the next unit, so rounding
      // never produces "60 minutes" or "365 days".
      const seconds = Math.pow(10, log10Seconds);
      if (seconds < 59.5) return countOf(seconds, "second");
      if (seconds < 59.5 * 60) return countOf(seconds / 60, "minute");
      if (seconds < 23.5 * 3600) return countOf(seconds / 3600, "hour");
      if (seconds < 364.5 * 86400) return countOf(seconds / 86400, "day");

      const years = seconds / SECONDS_PER_YEAR;
      if (years < 999.5) return countOf(years, "year");
      for (let s = 0; s < YEAR_SCALES.length; s++) {
        const next = s + 1 < YEAR_SCALES.length ? YEAR_SCALES[s + 1][0] : 1e18;
        if (years < next * 0.9995) {
          return round1(years / YEAR_SCALES[s][0]) + " " + YEAR_SCALES[s][1] + " years";
        }
      }
      return "10^18 years";
    }

    /* -------------------------------------------------- strength checker */

    /**
     * Direction of a one-key step from a to b on any alphabet or keyboard
     * row: "r+" or "r-" for row r, or null. A run keeps one row and one
     * direction, so "abc" and "321" count but "aba" does not.
     */
    function stepBetween(a, b) {
      const x = a.toLowerCase();
      const y = b.toLowerCase();
      const steps = [];
      KEYBOARD_ROWS.forEach((row, r) => {
        const i = row.indexOf(x);
        const j = row.indexOf(y);
        if (i !== -1 && j !== -1 && Math.abs(i - j) === 1) {
          steps.push(r + (j > i ? "+" : "-"));
        }
      });
      return steps;
    }

    /** Length of the longest same-direction run starting at `start`. */
    function runFrom(chars, start) {
      let options = null;
      let end = start + 1;
      while (end < chars.length) {
        const steps = stepBetween(chars[end - 1], chars[end]);
        const kept = options
          ? steps.filter((step) => options.indexOf(step) !== -1)
          : steps;
        if (!kept.length) break;
        options = kept;
        end += 1;
      }
      return end - start;
    }

    function isLetter(c) {
      return /^[a-z]$/i.test(c);
    }

    function isDigit(c) {
      return c >= "0" && c <= "9" && c.length === 1;
    }

    function observedPoolSize(password) {
      let size = 0;
      if (/[a-z]/.test(password)) size += 26;
      if (/[A-Z]/.test(password)) size += 26;
      if (/[0-9]/.test(password)) size += 10;
      if (/[^a-zA-Z0-9]/.test(password)) size += 32;
      return Math.max(size, 2);
    }

    /** Strips up to `max` characters failing `keep` from both ends. Linear. */
    function trimEdges(text, keep, max) {
      let start = 0;
      let end = text.length;
      while (start < end && start < max && !keep.test(text[start])) start++;
      while (end > start && text.length - end < max && !keep.test(text[end - 1])) end--;
      return text.slice(start, end);
    }

    function deleet(text, map) {
      let out = "";
      for (const ch of text) out += map[ch] || ch;
      return out;
    }

    function caseShape(text) {
      if (text === text.toLowerCase()) return "lower";
      if (text === text.toUpperCase()) return "upper";
      const rest = text.slice(1);
      if (text.charAt(0) === text.charAt(0).toUpperCase() && rest === rest.toLowerCase()) {
        return "capital";
      }
      return "mixed";
    }

    /**
     * Capitalising every word the same way is one rule to an attacker, not
     * one choice per word.
     */
    function caseBits(words) {
      if (!words.length) return 0;
      const shapes = words.map(caseShape);
      if (shapes[0] !== "mixed" && shapes.every((shape) => shape === shapes[0])) {
        return shapes[0] === "lower" ? 0 : 1;
      }
      return shapes.reduce((sum, shape, i) => {
        if (shape === "lower") return sum;
        if (shape === "mixed") {
          return sum + 1 + (words[i].match(/[A-Z]/g) || []).length;
        }
        return sum + 1;
      }, 0);
    }

    /**
     * Estimates how many guesses an attacker needs by splitting the password
     * into the cheapest sequence of pieces an attacker would try: dictionary
     * words (with leet undone), common passwords, years, character runs,
     * keyboard sequences, copies of an earlier stretch, or single characters
     * from the observed pool. A small dynamic programme finds the split with
     * the lowest total cost in bits.
     */
    function estimate(chars) {
      const n = chars.length;
      const lower = chars.map((c) => c.toLowerCase());
      const readings = [
        lower,
        lower.map((c) => LEET_I[c] || c),
        lower.map((c) => LEET_L[c] || c),
      ];
      const charBits = Math.log2(observedPoolSize(chars.join("")));
      const digitBits = Math.log2(10);

      // Per-character cost. A separator between two words that already
      // appeared earlier is a reuse, not a fresh choice: picking it again
      // costs only the choice among symbols seen so far (zero if just one).
      const single = new Array(n);
      const symbolsSeen = new Set();
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        single[i] = charBits;
        if (isLetter(c) || isDigit(c)) continue;
        const between =
          i > 0 && i + 1 < n && isLetter(chars[i - 1]) && isLetter(chars[i + 1]);
        if (between && symbolsSeen.has(c)) {
          single[i] = Math.min(charBits, Math.log2(symbolsSeen.size));
        }
        symbolsSeen.add(c);
      }

      const best = new Array(n + 1).fill(Infinity);
      const from = new Array(n + 1);
      const kind = new Array(n + 1);
      best[0] = 0;

      function relax(i, j, bits, type) {
        if (best[i] + bits < best[j]) {
          best[j] = best[i] + bits;
          from[j] = i;
          kind[j] = type;
        }
      }

      for (let i = 0; i < n; i++) {
        relax(i, i + 1, single[i], "char");

        // aaaa — one character repeated
        let end = i + 1;
        while (end < n && lower[end] === lower[i]) end++;
        for (let j = i + 3; j <= end; j++) {
          relax(i, j, charBits + Math.log2(j - i), "repeat");
        }

        // abcd, 4321, qwer — an alphabet or keyboard run
        const run = runFrom(chars, i);
        for (let len = 3; len <= run; len++) {
          relax(i, i + len, charBits + Math.log2(len) + 1, "sequence");
        }

        // 1987, 2024 — a year
        if (i + 4 <= n && /^(19|20)\d\d$/.test(lower.slice(i, i + 4).join(""))) {
          relax(i, i + 4, Math.log2(200), "year");
        }

        // Dictionary words and common passwords; each undone swap costs a
        // bit. Leet is only tried on four letters or more — on three it mostly
        // finds accidental words in random strings. Up to four digits right
        // after a word ("Summer7", "Pass123") cost what they are: digits.
        const longest = Math.min(MAX_TOKEN_LENGTH, n - i);
        for (let len = 3; len <= longest; len++) {
          readings.forEach((reading, r) => {
            if (r > 0 && len < 4) return;
            const text = reading.slice(i, i + len).join("");
            const inList = WORD_SET.has(text);
            if (!inList && !COMMON_ONLY.has(text)) return;
            let bits = inList ? WORD_BITS : COMMON_BITS;
            for (let k = i; k < i + len; k++) {
              if (reading[k] !== lower[k]) bits += 1;
            }
            const type = inList ? "word" : "common";
            relax(i, i + len, bits, type);
            for (let d = i + len; d < n && d < i + len + 4 && isDigit(chars[d]); d++) {
              relax(i, d + 1, bits + (d + 1 - i - len) * digitBits, type);
            }
          });
        }

        // A copy of an earlier stretch (it may overlap, as in "abcabcabc").
        if (i > 0) {
          let match = 0;
          for (let k = 0; k < i && match < n - i; k++) {
            let len = 0;
            while (i + len < n && lower[k + len] === lower[i + len]) len++;
            if (len > match) match = len;
          }
          for (let len = 3; len <= match; len++) {
            relax(i, i + len, Math.log2(i) + Math.log2(len) + 1, "copy");
          }
        }
      }

      const tokens = [];
      for (let j = n; j > 0; j = from[j]) {
        tokens.unshift({ start: from[j], end: j, kind: kind[j] });
      }
      const words = tokens
        .filter((t) => t.kind === "word" || t.kind === "common")
        .map((t) => chars.slice(t.start, t.end).join(""));

      return { bits: best[n] + caseBits(words), tokens: tokens };
    }

    function analyze(input) {
      const chars = Array.from(String(input)).slice(0, MAX_CHECK_LENGTH);
      const password = chars.join("");
      const lower = password.toLowerCase();
      const length = chars.length;

      const result = estimate(chars);
      let bits = result.bits;
      const tokens = result.tokens;

      // Compare against the common-password list the way a cracker would:
      // after undoing leet swaps and stripping a short prefix or suffix (up to
      // six characters, enough for "2024!!" but not for a random tail).
      const loose = trimEdges(lower, /[a-z@$]/, 6);
      const strict = trimEdges(lower, /[a-z]/, 6);
      const variants = [
        deleet(lower, LEET_I),
        deleet(lower, LEET_L),
        loose,
        strict,
        deleet(loose, LEET_I),
        deleet(loose, LEET_L),
      ];

      let common = null;
      if (COMMON_PASSWORDS.has(lower)) {
        bits = Math.min(bits, 8);
        common =
          "This is one of the most guessed passwords in the world — change it everywhere it is used.";
      } else if (variants.some((v) => v.length >= 3 && COMMON_PASSWORDS.has(v))) {
        bits = Math.min(bits, 22);
        common =
          "A well-known password dressed up with predictable swaps (@ for a, 0 for o, a number on the end). Cracking tools try those first.";
      }

      const score = scoreFromBits(bits);
      const findings = [];
      if (common) findings.push(["bad", common]);

      if (length < 8) {
        findings.push([
          "bad",
          "Only " + length + " characters. Anything under 8 falls in seconds.",
        ]);
      } else if (length < 12) {
        findings.push(["warn", length + " characters is short. Aim for 16 or more."]);
      } else {
        findings.push(["good", length + " characters is a good length."]);
      }

      const wordTokens = tokens.filter(
        (t) => t.kind === "word" || t.kind === "common"
      );
      const wordLetters = wordTokens.reduce((sum, t) => sum + t.end - t.start, 0);
      if (!common && wordTokens.length && wordLetters >= length * 0.5) {
        if (wordTokens.some((t) => t.kind === "common")) {
          findings.push([
            "bad",
            "Contains a very common password or name — cracking lists try those first.",
          ]);
        }
        if (wordTokens.length === 1) {
          findings.push([
            "warn",
            "Built around a single dictionary word — a word list cracks that far faster than its length suggests.",
          ]);
        } else {
          findings.push([
            score >= 4 ? "good" : "warn",
            "Recognised as " +
              wordTokens.length +
              " dictionary words, so it is scored per word rather than per character.",
          ]);
        }
      }

      if (tokens.some((t) => t.kind === "copy")) {
        findings.push([
          "warn",
          "Repeats an earlier part of itself — a repeated block adds almost nothing.",
        ]);
      }

      if (/(.)\1{2,}/u.test(password)) {
        findings.push(["warn", "Contains a character repeated three or more times in a row."]);
      }

      let longestRun = 0;
      for (let i = 0; i < length; i++) {
        longestRun = Math.max(longestRun, runFrom(chars, i));
      }
      if (longestRun >= 4) {
        findings.push([
          "warn",
          "Contains a keyboard or alphabet run such as “abcd”, “1234” or “qwer”.",
        ]);
      }

      if (/(19|20)\d{2}/.test(password)) {
        findings.push([
          "warn",
          "Looks like it contains a year — birthdays and dates are guessed early.",
        ]);
      }

      // Length beats variety, so only nag about variety when it shows.
      const classes = [
        /[a-z]/.test(password),
        /[A-Z]/.test(password),
        /[0-9]/.test(password),
        /[^a-zA-Z0-9]/.test(password),
      ].filter(Boolean).length;
      if (classes <= 2 && score < 4) {
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

    return {
      CHARS: CHARS,
      SCORE_LABELS: SCORE_LABELS,
      MAX_CHECK_LENGTH: MAX_CHECK_LENGTH,
      hasCrypto: hasCrypto,
      wordCount: wordList.length,
      randomInt: randomInt,
      shuffle: shuffle,
      buildCharacterSets: buildCharacterSets,
      passwordEntropy: passwordEntropy,
      makePassword: makePassword,
      makePassphrase: makePassphrase,
      makePin: makePin,
      scoreFromBits: scoreFromBits,
      formatCrackTime: formatCrackTime,
      analyze: analyze,
    };
  }

  if (typeof module === "object" && module.exports) {
    module.exports = createCore;
  } else {
    // wordlist.js declares WORDS as a top-level const, which is a lexical
    // global rather than a property of window — hence the typeof guard.
    root.FortiPassCore = createCore({
      crypto: root.crypto || root.msCrypto,
      words: typeof WORDS !== "undefined" && Array.isArray(WORDS) ? WORDS : [],
    });
  }
})(typeof self !== "undefined" ? self : globalThis);
