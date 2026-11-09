"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const createCore = require("../core.js");
const WORDS = require("../wordlist.js");

const core = createCore({ crypto: globalThis.crypto, words: WORDS });

const BASE = {
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  requireEach: true,
  excludeAmbiguous: false,
  noRepeats: false,
  excludeChars: "",
  words: 6,
  separator: "-",
  capitalize: true,
  addNumber: true,
  addSymbol: false,
  pinLength: 6,
};
const opts = (overrides) => Object.assign({}, BASE, overrides);

/* ------------------------------------------------------------ randomness */

test("randomInt stays in range and rejects bad bounds", () => {
  for (let i = 0; i < 2000; i++) {
    const n = core.randomInt(7);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 7);
  }
  assert.equal(core.randomInt(1), 0);
  assert.throws(() => core.randomInt(0), RangeError);
  assert.throws(() => core.randomInt(-3), RangeError);
});

test("randomInt is uniform (chi-square, 89 degrees of freedom)", () => {
  const buckets = 90;
  const draws = 180000;
  const counts = new Array(buckets).fill(0);
  for (let i = 0; i < draws; i++) counts[core.randomInt(buckets)] += 1;
  const expected = draws / buckets;
  const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
  // Mean 89, sd ~13.3; 160 is beyond p = 1e-6, so this does not flake.
  assert.ok(chi < 160, "chi-square " + chi.toFixed(1));
});

test("shuffle produces every permutation equally often", () => {
  const counts = {};
  const rounds = 60000;
  for (let i = 0; i < rounds; i++) {
    const key = core.shuffle(["a", "b", "c"]).join("");
    counts[key] = (counts[key] || 0) + 1;
  }
  assert.equal(Object.keys(counts).length, 6);
  for (const key of Object.keys(counts)) {
    assert.ok(Math.abs(counts[key] - rounds / 6) < 600, key + ": " + counts[key]);
  }
});

test("refuses to generate without a CSPRNG instead of falling back", () => {
  const bare = createCore({ words: WORDS });
  assert.equal(bare.hasCrypto, false);
  assert.throws(() => bare.randomInt(10));
});

/* -------------------------------------------------------------- passwords */

test("password honours length and character types", () => {
  for (let i = 0; i < 500; i++) {
    const { value } = core.makePassword(opts({ length: 4 }));
    assert.equal(value.length, 4);
    assert.match(value, /[A-Z]/);
    assert.match(value, /[a-z]/);
    assert.match(value, /[0-9]/);
    assert.match(value, /[^A-Za-z0-9]/);
  }
  const digits = core.makePassword(opts({ uppercase: false, lowercase: false, symbols: false, length: 40 }));
  assert.match(digits.value, /^[0-9]{40}$/);
});

test("password without repeats never repeats a character", () => {
  for (let i = 0; i < 300; i++) {
    const { value } = core.makePassword(opts({ length: 60, noRepeats: true }));
    assert.equal(new Set(value).size, 60);
  }
});

test("password exclusions are respected", () => {
  const ambiguous = core.makePassword(opts({ length: 128, excludeAmbiguous: true }));
  assert.doesNotMatch(ambiguous.value, /[Il1|O0oB8S5Z2G6]/);
  const excluded = core.makePassword(opts({ length: 128, excludeChars: "aeiouAEIOU#" }));
  assert.doesNotMatch(excluded.value, /[aeiouAEIOU#]/);
});

test("password errors explain what is wrong", () => {
  const none = core.makePassword(
    opts({ uppercase: false, lowercase: false, numbers: false, symbols: false })
  );
  assert.match(none.error, /at least one character type/);

  const allExcluded = core.makePassword(
    opts({ uppercase: false, lowercase: false, symbols: false, excludeChars: "0123456789" })
  );
  assert.match(allExcluded.error, /excluded/);

  const tooLong = core.makePassword(opts({ length: 100, noRepeats: true }));
  assert.match(tooLong.error, /unique characters/);
});

/** Counts valid strings by brute force, for checking the closed form. */
function bruteForceBits(alphabet, sets, length, noRepeats) {
  let count = 0;
  const walk = (prefix) => {
    if (prefix.length === length) {
      if (sets.every((set) => prefix.some((c) => set.includes(c)))) count += 1;
      return;
    }
    for (const c of alphabet) {
      if (noRepeats && prefix.includes(c)) continue;
      walk(prefix.concat(c));
    }
  };
  walk([]);
  return Math.log2(count);
}

test("password entropy is exact, including 'use every type'", () => {
  const alphabet = ["a", "b", "c", "D", "E", "1"];
  const sets = [["a", "b", "c"], ["D", "E"], ["1"]];
  for (const length of [3, 4, 5]) {
    for (const noRepeats of [false, true]) {
      const expected = bruteForceBits(alphabet, sets, length, noRepeats);
      const actual = core.passwordEntropy(6, [3, 2, 1], length, noRepeats, true);
      assert.ok(Math.abs(expected - actual) < 1e-9, `len ${length} noRepeats ${noRepeats}`);
    }
  }

  // The real character sets: 26 + 26 + 10 + 28 symbols, length 4.
  const four = core.makePassword(opts({ length: 4 }));
  assert.ok(Math.abs(four.entropy - Math.log2(26 * 26 * 10 * 28 * 24)) < 1e-9);

  const plain = core.makePassword(opts({ requireEach: false }));
  assert.ok(Math.abs(plain.entropy - 16 * Math.log2(90)) < 1e-9);
});

/* ------------------------------------------------- passphrases and PINs */

test("passphrase uses list words and reports list-based entropy", () => {
  const list = new Set(WORDS);
  const result = core.makePassphrase(opts({ capitalize: false, addNumber: false }));
  const words = result.value.split("-");
  assert.equal(words.length, 6);
  words.forEach((word) => assert.ok(list.has(word), word));
  assert.ok(Math.abs(result.entropy - 6 * Math.log2(WORDS.length)) < 1e-9);

  const digits = core.makePassphrase(opts({ separator: "digit", addNumber: false, words: 4 }));
  assert.match(digits.value, /^[A-Z][a-z]+\d[A-Z][a-z]+\d[A-Z][a-z]+\d[A-Z][a-z]+$/);
  assert.ok(Math.abs(digits.entropy - (4 * Math.log2(WORDS.length) + 3 * Math.log2(10))) < 1e-9);
});

test("PIN contains only digits", () => {
  const pin = core.makePin(opts({ pinLength: 9 }));
  assert.match(pin.value, /^\d{9}$/);
  assert.ok(Math.abs(pin.entropy - 9 * Math.log2(10)) < 1e-9);
});

/* ---------------------------------------------------------------- metrics */

test("crack time reads naturally at every boundary", () => {
  const awkward =
    /^(1 (second|minute|hour|day|year)s|60 seconds|60 minutes|24 hours|365 days|1000 years|1000 \w+ years|0 \w+)$/;
  for (let bits = 0; bits <= 140; bits += 0.01) {
    const text = core.formatCrackTime(bits);
    assert.doesNotMatch(text, awkward, `${bits.toFixed(2)} bits → ${text}`);
  }
  assert.equal(core.formatCrackTime(10), "instantly");
  assert.match(core.formatCrackTime(200), /^10\^\d+ years$/);
});

/* ------------------------------------------------------- strength checker */

test("checker rates well-known weak patterns as weak", () => {
  const cases = {
    password: 1,
    "P@ssw0rd": 1,
    "Password1!": 1,
    "Summer2024!": 1,
    Jennifer1985: 1,
    MichaelJordan23: 1,
    "1q2w3e4r5t6y": 1,
    qwertyuiopasdfgh: 1,
    ["a".repeat(32)]: 1,
    ["!".repeat(20)]: 1,
    "Dog-Dog-Dog": 1,
    dogdogdog: 1,
    "Ab3$Ab3$Ab3$Ab3$": 2,
    "Monkey$Banana$Monkey": 2,
    correcthorsebatterystaple: 2,
  };
  for (const [password, maxScore] of Object.entries(cases)) {
    const { score } = core.analyze(password);
    assert.ok(score <= maxScore, `${password} scored ${score}, expected ≤ ${maxScore}`);
  }
});

test("checker does not call random strings common passwords", () => {
  for (const password of ["god#41&29!77%03^58", "dragon-48291-!@#$%-73920"]) {
    const result = core.analyze(password);
    assert.ok(result.score >= 4, password + " scored " + result.score);
    assert.ok(
      !result.findings.some((f) => /most guessed|well-known password/.test(f[1])),
      password
    );
  }
});

test("checker agrees with the generator on generated output", () => {
  const configs = [
    ["16-char password", core.makePassword, opts({})],
    ["12-char password", core.makePassword, opts({ length: 12 })],
    ["readable password", core.makePassword, opts({ length: 20, symbols: false, excludeAmbiguous: true })],
    ["6 words, hyphen, number", core.makePassphrase, opts({})],
    ["6 words, lowercase", core.makePassphrase, opts({ capitalize: false, addNumber: false })],
    ["3 words, no separator", core.makePassphrase, opts({ words: 3, separator: "", capitalize: false, addNumber: false })],
    ["5 words, no separator", core.makePassphrase, opts({ words: 5, separator: "", addNumber: false })],
    ["6 words, digit separator", core.makePassphrase, opts({ separator: "digit" })],
    ["7 words, space, symbol", core.makePassphrase, opts({ words: 7, separator: " ", addSymbol: true })],
  ];
  for (const [label, make, options] of configs) {
    for (let i = 0; i < 150; i++) {
      const generated = make(options);
      const checked = core.analyze(generated.value).bits;
      const diff = checked - generated.entropy;
      // The checker may spot an accidental word or run in a random string,
      // and it gives a few bits for not knowing the separator — but it must
      // never be wildly off, as it once was (33 bits vs 71).
      assert.ok(diff > -25 && diff < 16, `${label}: ${generated.value} gen ${generated.entropy.toFixed(1)} vs checker ${checked.toFixed(1)}`);
    }
  }

  // Concatenated lowercase words are found, not scored as random letters.
  for (let i = 0; i < 100; i++) {
    const generated = core.makePassphrase(
      opts({ words: 4, separator: "", capitalize: false, addNumber: false })
    );
    assert.ok(core.analyze(generated.value).bits <= generated.entropy + 1, generated.value);
  }
});

test("checker stays fast on adversarial and oversized input", () => {
  const inputs = [
    "a".repeat(300),
    "ab".repeat(150),
    "!".repeat(255) + "a",
    "1".repeat(255) + "a",
    "correcthorse".repeat(25),
    "x".repeat(100000),
  ];
  const start = Date.now();
  inputs.forEach((input) => core.analyze(input));
  assert.ok(Date.now() - start < 1500, "took " + (Date.now() - start) + " ms");
});
