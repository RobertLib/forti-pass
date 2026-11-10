/* ==========================================================================
   FortiPass core — randomness, generators, entropy maths and the strength
   checker. It never touches the DOM, so the same file runs in the browser
   (as window.FortiPassCore) and under Node (as module.exports, used by the
   tests, the static-site build and the command-line tool).
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

  // A well-known password with predictable changes is worth at most this
  // many bits. Changes up to DRESSING_LIMIT bits (a year, "!!", "123", a
  // separator) are such dressing; anything costlier is real randomness and
  // the piece-by-piece estimate prices it.
  const DRESSED_BITS = 22;
  const DRESSING_LIMIT = 24;
  // A phrase of words split by one repeated separator, and what picking that
  // separator from the usual few costs.
  const PHRASE = /^[a-z]+([ ._+-])[a-z]+(?:\1[a-z]+)*$/;
  const SEPARATOR_BITS = 2;

  // "Use every type" is enforced by rejection sampling, which needs a handful
  // of tries for any realistic option mix. This only stops a pathological one.
  const MAX_ATTEMPTS = 100000;

  // Stored without diacritics: the checker folds its input the same way, so
  // "Kočička" and "kocicka" are the same guess — as they are to a cracker.
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
      "monkey1 sunshine1 princess1 michael1 love sex god money " +
      // The famous XKCD example is in every cracking list by now.
      "correcthorsebatterystaple correcthorse " +
      // Czech favourites: the word for "password", greetings, clubs, pets,
      // pet names, cars and cities.
      "heslo heslo1 heslo12 heslo123 heslo1234 mojeheslo tajneheslo noveheslo " +
      "heslicko ahoj ahojky ahoj123 ahojahoj nazdar cau cus qwertz qwertz123 " +
      "yxcvbnm sparta slavia banik hokej fotbal pivo praha brno ostrava plzen " +
      "cesko skoda octavia fabia felicia jawa tatra kocicka kocour pejsek " +
      "medved medvidek zajicek beruska princezna andilek poklad zlaticko " +
      "milacek laska miluji milujute slunicko slunce maminka tatinek babicka " +
      "dedecek pepicek honzik " +
      // The most common Czech given names and surnames.
      "jan jiri petr josef pavel martin tomas jaroslav miroslav zdenek vaclav " +
      "michal frantisek jakub milan karel lukas david ondrej vladimir ladislav " +
      "roman stanislav marek radek daniel filip adam vojtech matej antonin " +
      "jaromir ales dominik patrik libor robert vlastimil oldrich rudolf " +
      "bohumil ivan richard radim kamil jindrich honza pepa franta tonda jirka " +
      "ondra kuba marie jana eva hana anna lenka katerina petra lucie vera " +
      "alena martina jaroslava veronika zuzana ivana michaela jitka tereza " +
      "marketa monika barbora helena ludmila jarmila zdenka kristyna dana " +
      "marcela vlasta pavla eliska natalie adela klara karolina simona andrea " +
      "nikola denisa iveta blanka romana olga radka sarka zaneta katka misa " +
      "terka bara novak svoboda novotny dvorak cerny prochazka kucera vesely " +
      "horak nemec pospisil pokorny hajek kral jelinek ruzicka benes fiala " +
      "sedlacek dolezal zeman kolar navratil cermak vanek urban blazek kriz " +
      "kovar bartos vlcek polak kopecky konecny maly holub stastny"
    ).split(/\s+/)
  );

  // Alphabet, digits and keyboard lines a walk can follow, in either
  // direction. Rows cover QWERTY, QWERTZ and AZERTY; columns are what
  // "1qaz2wsx"-style walks go down.
  const KEYBOARD_ROWS = [
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
    "1234567890-=",
    "qwertyuiop[]",
    "asdfghjkl;'",
    "zxcvbnm,./",
    "qwertzuiop",
    "yxcvbnm",
    "azertyuiop",
    // The Czech keyboard's number row, typed without Shift.
    "+ěščřžýáíé=",
    // Columns, top to bottom (QWERTY, plus the two QWERTZ differs in).
    "1qaz",
    "2wsx",
    "3edc",
    "4rfv",
    "5tgb",
    "6yhn",
    "7ujm",
    "8ik,",
    "9ol.",
    "0p;/",
    "1qay",
    "6zhn",
  ];

  // A US keyboard's Shift layer, so "!@#$" walks the number row like "1234"
  // and "!QAZ" goes down a column like "1qaz".
  const UNSHIFTED = {
    "!": "1",
    "@": "2",
    "#": "3",
    $: "4",
    "%": "5",
    "^": "6",
    "&": "7",
    "*": "8",
    "(": "9",
    ")": "0",
    _: "-",
    "+": "=",
    "{": "[",
    "}": "]",
    ":": ";",
    '"': "'",
    "<": ",",
    ">": ".",
    "?": "/",
  };

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

  /* -------------------------------------------------------------- messages */

  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

  // English is built in; a locale file (locale-cs.js) overrides any part.
  const MESSAGES_EN = {
    scoreLabels: ["", "Very weak", "Weak", "Fair", "Strong", "Excellent"],
    errors: {
      noTypes: "Select at least one character type.",
      allExcluded:
        "Every character of the selected types is excluded — remove some exclusions.",
      typeExcluded:
        "Every character of one of the selected types is excluded — remove some exclusions or turn that type off.",
      notEnoughUnique: (n) =>
        "Only " + n + " unique characters available — shorten the password or allow repeats.",
      unsatisfiable:
        "These options cannot be satisfied — lengthen the password or relax them.",
      tooRestrictive:
        "These options are too restrictive — lengthen the password or allow more characters.",
      noWordList: "Word list failed to load — reload the page.",
    },
    time: {
      instantly: "instantly",
      count: (n, unit) => plural(n, unit, unit + "s"),
      scaled: (value, scale) => value + " " + scale + " years",
      power: (exponent) => "10^" + exponent + " years",
    },
    findings: {
      mostGuessed:
        "This is one of the most guessed passwords in the world — change it everywhere it is used.",
      dressedUp:
        "A well-known password dressed up with predictable changes (@ for a, 0 for o, separators, a number on the end). Cracking tools try those first.",
      tooShort: (n) =>
        "Only " + plural(n, "character", "characters") + ". Anything under 8 falls within minutes.",
      short: (n) => n + " characters is short. Aim for 16 or more.",
      goodLength: (n) => n + " characters is a good length.",
      commonName:
        "Contains a very common password or name — cracking lists try those first.",
      singleWord:
        "Built around a single dictionary word — a word list cracks that far faster than its length suggests.",
      words: (n) =>
        "Recognised as " + n + " dictionary words, so it is scored per word rather than per character.",
      copy: "Repeats an earlier part of itself — a repeated block adds almost nothing.",
      repeatChar: "Contains a character repeated three or more times in a row.",
      run: "Contains a keyboard or alphabet run such as “abcd”, “1234”, “qwer” or “1qaz”.",
      year: "Looks like it contains a year — birthdays and dates are guessed early.",
      fewTypes: (n) =>
        "Only " +
        plural(n, "character type", "character types") +
        " in use. Mixing upper case, digits and symbols multiplies the search space.",
      allTypes: "Uses all four character types.",
      nothingToImprove: "Nothing obvious to improve — just never reuse it on another site.",
    },
  };

  function mergeMessages(custom) {
    const merged = {};
    Object.keys(MESSAGES_EN).forEach((group) => {
      const base = MESSAGES_EN[group];
      const over = custom && custom[group];
      merged[group] = Array.isArray(base)
        ? (Array.isArray(over) ? over : base).slice()
        : Object.assign({}, base, over || {});
    });
    return merged;
  }

  /* ---------------------------------------------------------------- text */

  /** "č" → "c", "Ů" → "U"; anything that is not a letter plus accents stays. */
  function foldChar(c) {
    if (c.charCodeAt(0) < 0x80) return c;
    const base = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return base.length === 1 ? base : c;
  }

  function fold(text) {
    return Array.from(String(text)).map(foldChar).join("");
  }

  /* ------------------------------------------------------------------ core */

  /**
   * @param {{
   *   crypto?: {getRandomValues: Function},
   *   wordLists?: Object<string, {words: string[], extra?: string[]}>,
   *   words?: string[],
   *   messages?: Object
   * }} config  `wordLists` maps a language code to its passphrase list and
   *   optional checker-only extra words; `words` is shorthand for English.
   */
  function createCore(config) {
    const cfg = config || {};
    const cryptoObj = cfg.crypto;
    const hasCrypto =
      !!cryptoObj && typeof cryptoObj.getRandomValues === "function";
    const M = mergeMessages(cfg.messages);

    const sources = Object.assign({}, cfg.wordLists || {});
    if (Array.isArray(cfg.words) && !sources.en) sources.en = { words: cfg.words };

    // Passphrase lists, de-duplicated after folding accents so that the
    // "without diacritics" option cannot make two picks identical — every
    // word then contributes exactly log2(list size) bits either way.
    const LISTS = {};
    // Checker dictionary: folded word → bits to guess it, which is the size
    // of the cheapest language dictionary it appears in. That is never below
    // the passphrase list it came from, so the checker cannot undercut a
    // passphrase this app generated with a separator. (Words run together
    // can now and then be split into other, cheaper words.)
    const DICTIONARY = new Map();
    Object.keys(sources).forEach((lang) => {
      const source = sources[lang] || {};
      const seen = new Set();
      const words = [];
      (source.words || []).forEach((raw) => {
        const word = String(raw).toLowerCase().trim();
        const key = fold(word);
        if (!word || seen.has(key)) return;
        seen.add(key);
        words.push(word);
      });
      if (words.length) LISTS[lang] = words;

      const all = new Set(seen);
      (source.extra || []).forEach((raw) => all.add(fold(String(raw).toLowerCase().trim())));
      all.delete("");
      const bits = Math.log2(Math.max(all.size, 2));
      all.forEach((key) => {
        if (!DICTIONARY.has(key) || DICTIONARY.get(key) > bits) DICTIONARY.set(key, bits);
      });
    });
    const LANGUAGES = Object.keys(LISTS);

    // Common passwords that are also dictionary words are scored as words,
    // so a generated passphrase is never priced as a list of common passwords.
    const COMMON_ONLY = new Set(
      Array.from(COMMON_PASSWORDS).filter((word) => !DICTIONARY.has(word))
    );
    const COMMON_BITS = Math.log2(COMMON_ONLY.size);
    const MAX_TOKEN_LENGTH = Array.from(DICTIONARY.keys())
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

    /** A failed generation: the message to show and a code saying why. */
    function failure(code, message) {
      return { error: message, code: code };
    }

    function makePassword(opts) {
      if (!(opts.uppercase || opts.lowercase || opts.numbers || opts.symbols)) {
        return failure("noTypes", M.errors.noTypes);
      }
      const sets = buildCharacterSets(opts);
      if (!sets.length) return failure("allExcluded", M.errors.allExcluded);
      // A type the user asked for but excluded entirely would silently be
      // left out, and "use every selected type" would stop covering it.
      const requested = [opts.uppercase, opts.lowercase, opts.numbers, opts.symbols].filter(Boolean);
      if (sets.length < requested.length) return failure("typeExcluded", M.errors.typeExcluded);

      const pool = [].concat.apply([], sets);

      if (opts.noRepeats && opts.length > pool.length) {
        return failure("notEnoughUnique", M.errors.notEnoughUnique(pool.length));
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
      if (!isFinite(entropy)) return failure("unsatisfiable", M.errors.unsatisfiable);

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

      return failure("tooRestrictive", M.errors.tooRestrictive);
    }

    /** The list for `language`, or the first one loaded. */
    function listFor(language) {
      return LISTS[language] || LISTS[LANGUAGES[0]] || [];
    }

    function makePassphrase(opts) {
      const list = listFor(opts.language);
      if (list.length < 100) return failure("noWordList", M.errors.noWordList);

      const words = [];
      for (let i = 0; i < opts.words; i++) {
        let word = pick(list);
        if (opts.ascii) word = fold(word);
        words.push(
          opts.capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word
        );
      }

      let entropy = opts.words * Math.log2(list.length);
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

    function formatCrackTime(bits) {
      const T = M.time;
      if (!isFinite(bits) || bits <= 0) return T.instantly;

      // Average work is half the keyspace; stay in log space so huge
      // keyspaces do not overflow to Infinity.
      const log10Seconds =
        (bits - 1) * LOG10_2 - Math.log10(GUESSES_PER_SECOND);
      if (log10Seconds < 0) return T.instantly;

      const log10Years = log10Seconds - Math.log10(SECONDS_PER_YEAR);
      if (log10Years >= 18) return T.power(Math.round(log10Years));

      // Each threshold sits half a unit below the next unit, so rounding
      // never produces "60 minutes" or "365 days".
      const seconds = Math.pow(10, log10Seconds);
      if (seconds < 59.5) return T.count(Math.round(seconds), "second");
      if (seconds < 59.5 * 60) return T.count(Math.round(seconds / 60), "minute");
      if (seconds < 23.5 * 3600) return T.count(Math.round(seconds / 3600), "hour");
      if (seconds < 364.5 * 86400) return T.count(Math.round(seconds / 86400), "day");

      const years = seconds / SECONDS_PER_YEAR;
      if (years < 999.5) return T.count(Math.round(years), "year");
      for (let s = 0; s < YEAR_SCALES.length; s++) {
        const next = s + 1 < YEAR_SCALES.length ? YEAR_SCALES[s + 1][0] : 1e18;
        if (years < next * 0.9995) {
          return T.scaled(round1(years / YEAR_SCALES[s][0]), YEAR_SCALES[s][1]);
        }
      }
      return T.power(18);
    }

    /* -------------------------------------------------- strength checker */

    /**
     * Direction of a one-key step from a to b on any alphabet or keyboard
     * row: "r+" or "r-" for row r, or null. A run keeps one row and one
     * direction, so "abc" and "321" count but "aba" does not.
     */
    function keyIndex(row, c) {
      const i = row.indexOf(c);
      return i === -1 && UNSHIFTED[c] ? row.indexOf(UNSHIFTED[c]) : i;
    }

    function stepBetween(a, b) {
      const x = a.toLowerCase();
      const y = b.toLowerCase();
      const steps = [];
      KEYBOARD_ROWS.forEach((row, r) => {
        const i = keyIndex(row, x);
        const j = keyIndex(row, y);
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
      return /^\p{L}$/u.test(c);
    }

    function isDigit(c) {
      return c >= "0" && c <= "9" && c.length === 1;
    }

    function observedPoolSize(password) {
      let size = 0;
      if (/[a-z]/.test(password)) size += 26;
      if (/[A-Z]/.test(password)) size += 26;
      if (/[0-9]/.test(password)) size += 10;
      // Accented letters (č, ř, ů…) are their own pool, not symbols.
      if (/(?![a-zA-Z])\p{L}/u.test(password)) size += 30;
      if (/[^\p{L}\p{N}]/u.test(password)) size += 32;
      return Math.max(size, 2);
    }

    /**
     * What is left of `chars` after stripping up to `max` characters that
     * fail `keep` from each end, as a span. Linear.
     */
    function trimSpan(chars, keep, max) {
      let start = 0;
      let end = chars.length;
      while (start < end && start < max && !keep.test(chars[start])) start++;
      while (end > start && chars.length - end < max && !keep.test(chars[end - 1])) end--;
      return { start: start, end: end };
    }

    function deleet(chars, map) {
      return chars.map((c) => map[c] || c).join("");
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
          return sum + 1 + (words[i].match(/\p{Lu}/gu) || []).length;
        }
        return sum + 1;
      }, 0);
    }

    /**
     * Estimates how many guesses an attacker needs by splitting the password
     * into the cheapest sequence of pieces an attacker would try: dictionary
     * words (with leet and accents undone), common passwords, years, character
     * runs, keyboard sequences, copies of an earlier stretch, or single
     * characters from the observed pool. A small dynamic programme finds the
     * split with the lowest total cost in bits.
     */
    function estimate(chars) {
      const n = chars.length;
      // Accents are folded away: crackers try "kocicka" for "kočička".
      const lower = chars.map((c) => foldChar(c.toLowerCase()));
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
            const inList = DICTIONARY.has(text);
            if (!inList && !COMMON_ONLY.has(text)) return;
            let bits = inList ? DICTIONARY.get(text) : COMMON_BITS;
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

    /**
     * The cheapest reading of the password as a well-known one with
     * predictable changes, the way a cracker's rules would try it: leet swaps
     * undone, up to six characters stripped from each end ("2024!!"), and the
     * separators of a phrase ("correct-horse-battery-staple") dropped.
     * Returns what the changes themselves cost in bits — the stripped edges
     * as the estimator prices them, plus the choice of separator — or null
     * when no reading is a well-known password. Edges of random characters
     * are expensive, so they keep the strength they genuinely add.
     */
    function dressedCost(chars, lowerChars) {
      const n = chars.length;
      const spans = [
        { start: 0, end: n },
        trimSpan(lowerChars, /[a-z@$]/, 6),
        trimSpan(lowerChars, /[a-z]/, 6),
      ];
      let best = null;
      const consider = (text, cost) => {
        if (text.length >= 3 && COMMON_PASSWORDS.has(text) && (best === null || cost < best)) {
          best = cost;
        }
      };
      spans.forEach((span) => {
        const middle = lowerChars.slice(span.start, span.end);
        if (middle.length < 3) return;
        const edges =
          (span.start > 0 ? estimate(chars.slice(0, span.start)).bits : 0) +
          (span.end < n ? estimate(chars.slice(span.end)).bits : 0);
        [middle.join(""), deleet(middle, LEET_I), deleet(middle, LEET_L)].forEach((text) => {
          consider(text, edges);
          const phrase = PHRASE.exec(text);
          if (phrase) consider(text.split(phrase[1]).join(""), edges + SEPARATOR_BITS);
        });
      });
      return best;
    }

    function analyze(input) {
      const F = M.findings;
      const chars = Array.from(String(input).normalize("NFC")).slice(0, MAX_CHECK_LENGTH);
      const password = chars.join("");
      const lowerChars = chars.map((c) => foldChar(c.toLowerCase()));
      const lower = lowerChars.join("");
      const length = chars.length;

      const result = estimate(chars);
      let bits = result.bits;
      const tokens = result.tokens;

      let common = null;
      if (COMMON_PASSWORDS.has(lower)) {
        bits = Math.min(bits, 8);
        common = F.mostGuessed;
      } else {
        // Only cheap changes are dressing; random edges are real strength.
        const changes = dressedCost(chars, lowerChars);
        if (changes !== null && changes <= DRESSING_LIMIT) {
          bits = Math.min(bits, DRESSED_BITS);
          common = F.dressedUp;
        }
      }

      const score = scoreFromBits(bits);
      const findings = [];
      if (common) findings.push(["bad", common]);

      if (length < 8) {
        findings.push(["bad", F.tooShort(length)]);
      } else if (length < 12) {
        findings.push(["warn", F.short(length)]);
      } else {
        findings.push(["good", F.goodLength(length)]);
      }

      const wordTokens = tokens.filter(
        (t) => t.kind === "word" || t.kind === "common"
      );
      const wordLetters = wordTokens.reduce((sum, t) => sum + t.end - t.start, 0);
      if (!common && wordTokens.length && wordLetters >= length * 0.5) {
        if (wordTokens.some((t) => t.kind === "common")) {
          findings.push(["bad", F.commonName]);
        }
        if (wordTokens.length === 1) {
          findings.push(["warn", F.singleWord]);
        } else {
          findings.push([score >= 4 ? "good" : "warn", F.words(wordTokens.length)]);
        }
      }

      if (tokens.some((t) => t.kind === "copy")) {
        findings.push(["warn", F.copy]);
      }

      if (/(.)\1{2,}/u.test(password)) {
        findings.push(["warn", F.repeatChar]);
      }

      let longestRun = 0;
      for (let i = 0; i < length; i++) {
        longestRun = Math.max(longestRun, runFrom(chars, i));
      }
      if (longestRun >= 4) {
        findings.push(["warn", F.run]);
      }

      if (/(19|20)\d{2}/.test(password)) {
        findings.push(["warn", F.year]);
      }

      // Length beats variety, so only nag about variety when it shows.
      const classes = [
        /\p{Ll}/u.test(password),
        /\p{Lu}/u.test(password),
        /[0-9]/.test(password),
        /[^\p{L}\p{N}]/u.test(password),
      ].filter(Boolean).length;
      if (classes <= 2 && score < 4) {
        findings.push(["warn", F.fewTypes(classes)]);
      } else if (classes === 4) {
        findings.push(["good", F.allTypes]);
      }

      if (score >= 4 && !findings.some((f) => f[0] !== "good")) {
        findings.push(["good", F.nothingToImprove]);
      }

      // Praise reads as mockery next to a failing verdict, so drop it.
      const relevant =
        score <= 2 ? findings.filter((f) => f[0] !== "good") : findings;

      return { bits: bits, score: score, findings: relevant.slice(0, 5) };
    }

    /* ------------------------------------------------------------- Wi-Fi */

    /** Backslash-escapes the characters the Wi-Fi QR format reserves. */
    function escapeWifi(text) {
      return String(text).replace(/([\\;,:"])/g, "\\$1");
    }

    /**
     * The text phones understand when a Wi-Fi QR code is scanned:
     * WIFI:T:WPA;S:<name>;P:<password>;;  ("WPA" covers WPA2 and WPA3 too).
     */
    function wifiPayload(opts) {
      const open = opts.security === "nopass";
      let text = "WIFI:T:" + (open ? "nopass" : "WPA") + ";S:" + escapeWifi(opts.ssid) + ";";
      if (!open) text += "P:" + escapeWifi(opts.password) + ";";
      if (opts.hidden) text += "H:true;";
      return text + ";";
    }

    /**
     * Why a WPA key would be rejected by a router, or null: it must be 8–63
     * printable ASCII characters (a 64-digit hex string is a raw key).
     */
    function wifiPasswordProblem(password) {
      const text = String(password);
      if (/^[0-9a-fA-F]{64}$/.test(text)) return null;
      if (/[^\x20-\x7e]/.test(text)) return "ascii";
      if (text.length < 8) return "short";
      if (text.length > 63) return "long";
      return null;
    }

    /** Bytes the text takes in UTF-8, as a router counts them. */
    function utf8Length(text) {
      let bytes = 0;
      for (const ch of String(text)) {
        const code = ch.codePointAt(0);
        bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
      }
      return bytes;
    }

    /**
     * Why a network name would be rejected, or null: an SSID is at most 32
     * bytes, and accented letters take two of them.
     */
    function wifiSsidProblem(ssid) {
      return utf8Length(ssid) > 32 ? "ssidLong" : null;
    }

    /**
     * Something the router accepts but a phone scanning the code may get
     * wrong, or null. Android splits the fields before it undoes the
     * escaping, so a value ending in "\" swallows the next field, and it
     * takes a value in double quotes as already quoted and drops them. A
     * name with a space at either end is valid, but usually a paste error.
     * Generated passwords never contain "\" or '"'.
     */
    function wifiScanCaution(opts) {
      const values = [String(opts.ssid)];
      if (opts.security !== "nopass") values.push(String(opts.password));
      if (values.some((v) => v.endsWith("\\") || (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"'))) {
        return "android";
      }
      return /^\s|\s$/.test(values[0]) ? "ssidSpaces" : null;
    }

    return {
      CHARS: CHARS,
      SCORE_LABELS: M.scoreLabels,
      MAX_CHECK_LENGTH: MAX_CHECK_LENGTH,
      GUESSES_PER_SECOND: GUESSES_PER_SECOND,
      hasCrypto: hasCrypto,
      languages: LANGUAGES,
      wordCount: (language) => listFor(language).length,
      fold: fold,
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
      wifiPayload: wifiPayload,
      wifiPasswordProblem: wifiPasswordProblem,
      wifiSsidProblem: wifiSsidProblem,
      wifiScanCaution: wifiScanCaution,
    };
  }

  if (typeof module === "object" && module.exports) {
    module.exports = createCore;
  } else {
    // The word-list files register themselves in FortiPassWordLists and the
    // optional locale file in FortiPassLocale; both load before this one.
    const locale = root.FortiPassLocale;
    // The browser extension builds its own instance in the browser's language.
    root.FortiPassCreateCore = createCore;
    root.FortiPassCore = createCore({
      crypto: root.crypto || root.msCrypto,
      wordLists: root.FortiPassWordLists || {},
      messages: locale && locale.core,
    });
  }
})(typeof self !== "undefined" ? self : globalThis);
