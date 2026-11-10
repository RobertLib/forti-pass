#!/usr/bin/env node
"use strict";

/* FortiPass on the command line — the same core.js, word lists and entropy
   maths as the website, with Node's Web Crypto as the random source.

     fortipass                      one 16-character password
     fortipass -l 32 -n 5           five 32-character passwords
     fortipass -w 6                 a six-word passphrase
     fortipass -w 6 --lang cs       … from Czech words, without accents
     fortipass --pin 6              a 6-digit PIN
     fortipass --check              rate a password typed (hidden) or piped in

   Generated values go to stdout, one per line; the strength summary goes to
   stderr, so `fortipass | pbcopy` copies only the password. */

const { webcrypto } = require("node:crypto");
const createCore = require("../core.js");
const EN = require("../wordlist-en.js");
const CS = require("../wordlist-cs.js");
const LOCALE_CS = require("../locale-cs.js");
const { version: VERSION } = require("../package.json");

// Piped input is read up to the first line break and never past this many
// characters, so `yes | fortipass --check` cannot exhaust memory. The checker
// itself looks at the first 256 characters.
const MAX_INPUT = 4096;

const HELP = `Usage: fortipass [options]

Passwords (default)
  -l, --length <n>      length, 4–128 (default 16)
      --no-upper        leave out A–Z
      --no-lower        leave out a–z
      --no-digits       leave out 0–9
      --no-symbols      leave out symbols
      --readable        avoid look-alike characters (I l 1 O 0 …)
      --no-repeats      use every character at most once
      --exclude <chars> never use these characters

Passphrases
  -w, --words <n>       passphrase of n random words, 3–12
      --lang <en|cs>    English (EFF) or Czech words, and the language of
                        the summary and messages (default en)
      --accents         keep Czech accents (default: without)
  -s, --separator <c>   between words (default "-"); "digit" puts a random
                        digit between the words
      --lower           do not capitalise the words
      --no-number       do not append a digit
      --symbol          append a symbol as well

PINs
      --pin <n>         PIN of n digits, 3–16

General
  -n, --count <n>       how many to generate, 1–1000 (default 1)
      --check           rate a password from stdin instead of generating
      --json            machine-readable output
  -q, --quiet           no strength summary on stderr; with --check, print
                        nothing and only set the exit status
  -V, --version         print the version
  -h, --help            this help

Exit status: 0 on success, 1 when --check rates the password below Strong,
2 for a usage error.
`;

function fail(message) {
  process.stderr.write("fortipass: " + message + "\n");
  process.exit(2);
}

// `fortipass -n 1000 | head -1` closes the pipe early; that is not an error.
process.stdout.on("error", (err) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});
process.stderr.on("error", () => {});

function parse(argv) {
  const o = {
    length: 16,
    upper: true,
    lower: true,
    digits: true,
    symbols: true,
    readable: false,
    noRepeats: false,
    exclude: "",
    words: 0,
    lang: "en",
    accents: false,
    separator: "-",
    capitalize: true,
    number: true,
    symbol: false,
    pin: 0,
    count: 1,
    check: false,
    json: false,
    quiet: false,
  };
  const int = (name, value, min, max) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) fail(`${name} must be a whole number from ${min} to ${max}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) fail(arg + " needs a value");
      return argv[++i];
    };
    switch (arg) {
      case "-l": case "--length": o.length = int("--length", next(), 4, 128); break;
      case "--no-upper": o.upper = false; break;
      case "--no-lower": o.lower = false; break;
      case "--no-digits": o.digits = false; break;
      case "--no-symbols": o.symbols = false; break;
      case "--readable": o.readable = true; break;
      case "--no-repeats": o.noRepeats = true; break;
      case "--exclude": o.exclude = next(); break;
      case "-w": case "--words": o.words = int("--words", next(), 3, 12); break;
      case "--lang": o.lang = next(); if (!["en", "cs"].includes(o.lang)) fail("--lang is en or cs"); break;
      case "--accents": o.accents = true; break;
      case "-s": case "--separator": o.separator = next(); break;
      case "--lower": o.capitalize = false; break;
      case "--no-number": o.number = false; break;
      case "--symbol": o.symbol = true; break;
      case "--pin": o.pin = int("--pin", next(), 3, 16); break;
      case "-n": case "--count": o.count = int("--count", next(), 1, 1000); break;
      case "--check": o.check = true; break;
      case "--json": o.json = true; break;
      case "-q": case "--quiet": o.quiet = true; break;
      case "-V": case "--version": process.stdout.write(VERSION + "\n"); process.exit(0); break;
      case "-h": case "--help": process.stdout.write(HELP); process.exit(0); break;
      default: fail(`unknown option ${arg} (try --help)`);
    }
  }
  if (o.words && o.pin) fail("choose either --words or --pin");
  return o;
}

/** First line of piped input; stops reading at the line break or MAX_INPUT. */
function readLine(stdin) {
  return new Promise((resolve) => {
    let data = "";
    const finish = () => {
      stdin.removeListener("data", onData);
      stdin.removeListener("end", finish);
      stdin.destroy();
      resolve(data.split(/\r?\n/)[0].slice(0, MAX_INPUT));
    };
    const onData = (chunk) => {
      data += chunk;
      if (data.includes("\n") || data.length >= MAX_INPUT) finish();
    };
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    stdin.on("end", finish);
  });
}

/**
 * One line typed at the terminal without echo. Enter or Ctrl-D ends it,
 * Ctrl-C exits with 130, Backspace deletes, and escape sequences (arrow and
 * function keys) and other control characters are ignored.
 */
function readHidden(stdin, prompt) {
  return new Promise((resolve) => {
    process.stderr.write(prompt);
    let value = "";
    const done = () => {
      stdin.setRawMode(false);
      stdin.removeListener("data", onData);
      stdin.pause();
      process.stderr.write("\n");
    };
    const onData = (chunk) => {
      // "esc" after a lone ESC, "csi" inside ESC [ … final byte, "ss3" after ESC O.
      let state = "";
      for (const ch of chunk) {
        const code = ch.codePointAt(0);
        if (state === "esc") {
          state = ch === "[" ? "csi" : ch === "O" ? "ss3" : "";
          continue;
        }
        if (state === "csi") {
          if (code >= 0x40 && code <= 0x7e) state = "";
          continue;
        }
        if (state === "ss3") {
          state = "";
          continue;
        }
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          done();
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          done();
          process.exit(130);
        }
        if (ch === "\u001b") state = "esc";
        else if (ch === "\u007f" || ch === "\b") value = Array.from(value).slice(0, -1).join("");
        else if (code >= 0x20 && value.length < MAX_INPUT) value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    stdin.resume();
  });
}

async function check(o, core, bits) {
  const stdin = process.stdin;
  const password = stdin.isTTY
    ? await readHidden(stdin, o.lang === "cs" ? "Heslo: " : "Password: ")
    : await readLine(stdin);
  if (!password) fail("no password to check — pipe one in or type it at the prompt");

  const result = core.analyze(password);
  process.exitCode = result.score >= 4 ? 0 : 1;
  if (o.quiet) return;

  const label = core.SCORE_LABELS[result.score];
  const crack = core.formatCrackTime(result.bits);
  if (o.json) {
    process.stdout.write(
      JSON.stringify({ score: result.score, label, bits: result.bits, crackTime: crack, findings: result.findings }) + "\n"
    );
    return;
  }
  process.stdout.write(`${label} · ${bits(result.bits)} · ${crack}\n`);
  result.findings.forEach(([kind, text]) =>
    process.stdout.write(`  ${kind === "good" ? "✓" : "!"} ${text}\n`)
  );
}

async function main() {
  const o = parse(process.argv.slice(2));
  const czech = o.lang === "cs";
  const core = createCore({
    crypto: webcrypto,
    wordLists: { en: EN, cs: CS },
    messages: czech ? LOCALE_CS.core : undefined,
  });
  if (!core.hasCrypto) fail("no secure random number generator available");
  const bits = (n) => (czech ? LOCALE_CS.ui.bits(Math.round(n)) : Math.round(n) + " bits");

  if (o.check) return check(o, core, bits);

  const options = {
    length: o.length,
    uppercase: o.upper,
    lowercase: o.lower,
    numbers: o.digits,
    symbols: o.symbols,
    requireEach: true,
    excludeAmbiguous: o.readable,
    noRepeats: o.noRepeats,
    excludeChars: o.exclude,
    words: o.words,
    language: o.lang,
    ascii: !o.accents,
    separator: o.separator,
    capitalize: o.capitalize,
    addNumber: o.number,
    addSymbol: o.symbol,
    pinLength: o.pin,
  };
  const make = o.words ? core.makePassphrase : o.pin ? core.makePin : core.makePassword;

  const values = [];
  let entropy = 0;
  for (let i = 0; i < o.count; i++) {
    const result = make(options);
    if (result.error) fail(result.error);
    values.push(result.value);
    entropy = result.entropy;
  }

  const score = core.scoreFromBits(entropy);
  if (o.json) {
    process.stdout.write(
      JSON.stringify({
        values,
        score,
        label: core.SCORE_LABELS[score],
        bits: entropy,
        crackTime: core.formatCrackTime(entropy),
      }) + "\n"
    );
    return;
  }
  process.stdout.write(values.join("\n") + "\n");
  if (!o.quiet) {
    process.stderr.write(
      `${core.SCORE_LABELS[score]} · ${bits(entropy)} · ${core.formatCrackTime(entropy)}` +
        (czech ? " při 10^11 pokusech za sekundu\n" : " at 10^11 guesses per second\n")
    );
  }
}

main().catch((err) => fail(err.message));
