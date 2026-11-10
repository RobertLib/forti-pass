#!/usr/bin/env node
"use strict";

/* FortiPass on the command line — the same core.js, word lists and entropy
   maths as the website, with Node's Web Crypto as the random source.

     fortipass                      one 20-character password
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

const HELP = `Usage: fortipass [options]

Passwords (default)
  -l, --length <n>      length, 4–128 (default 20)
      --no-upper        leave out A–Z
      --no-lower        leave out a–z
      --no-digits       leave out 0–9
      --no-symbols      leave out symbols
      --readable        avoid look-alike characters (I l 1 O 0 …)
      --exclude <chars> never use these characters

Passphrases
  -w, --words <n>       passphrase of n random words, 3–20
      --lang <en|cs>    word list: English (EFF) or Czech (default en)
      --accents         keep Czech accents (default: without)
  -s, --separator <c>   between words (default "-")
      --lower           do not capitalise the words
      --no-number       do not append a digit

PINs
      --pin <n>         PIN of n digits, 3–16

General
  -n, --count <n>       how many to generate, 1–1000 (default 1)
      --check           rate a password from stdin instead of generating
      --json            machine-readable output
  -q, --quiet           no strength summary on stderr
  -h, --help            this help
`;

function fail(message) {
  process.stderr.write("fortipass: " + message + "\n");
  process.exit(2);
}

function parse(argv) {
  const o = {
    length: 20,
    upper: true,
    lower: true,
    digits: true,
    symbols: true,
    readable: false,
    exclude: "",
    words: 0,
    lang: "en",
    accents: false,
    separator: "-",
    capitalize: true,
    number: true,
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
      case "--exclude": o.exclude = next(); break;
      case "-w": case "--words": o.words = int("--words", next(), 3, 20); break;
      case "--lang": o.lang = next(); if (!["en", "cs"].includes(o.lang)) fail("--lang is en or cs"); break;
      case "--accents": o.accents = true; break;
      case "-s": case "--separator": o.separator = next(); break;
      case "--lower": o.capitalize = false; break;
      case "--no-number": o.number = false; break;
      case "--pin": o.pin = int("--pin", next(), 3, 16); break;
      case "-n": case "--count": o.count = int("--count", next(), 1, 1000); break;
      case "--check": o.check = true; break;
      case "--json": o.json = true; break;
      case "-q": case "--quiet": o.quiet = true; break;
      case "-h": case "--help": process.stdout.write(HELP); process.exit(0); break;
      default: fail(`unknown option ${arg} (try --help)`);
    }
  }
  if (o.words && o.pin) fail("choose either --words or --pin");
  return o;
}

/** Reads one line from stdin; on a terminal the typing is not echoed. */
function readSecret(prompt) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => (data += chunk));
      stdin.on("end", () => resolve(data.split(/\r?\n/)[0]));
    });
  }
  return new Promise((resolve) => {
    process.stderr.write(prompt);
    let value = "";
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          process.stderr.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = Array.from(value).slice(0, -1).join("");
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const o = parse(process.argv.slice(2));
  const core = createCore({
    crypto: webcrypto,
    wordLists: { en: EN, cs: CS },
    messages: o.lang === "cs" ? LOCALE_CS.core : undefined,
  });
  if (!core.hasCrypto) fail("no secure random number generator available");
  const czech = o.lang === "cs";
  const bits = (n) => (czech ? LOCALE_CS.ui.bits(Math.round(n)) : Math.round(n) + " bits");

  if (o.check) {
    const password = await readSecret(o.lang === "cs" ? "Heslo: " : "Password: ");
    const result = core.analyze(password);
    const label = core.SCORE_LABELS[result.score];
    const crack = core.formatCrackTime(result.bits);
    if (o.json) {
      process.stdout.write(
        JSON.stringify({ score: result.score, label, bits: result.bits, crackTime: crack, findings: result.findings }) + "\n"
      );
    } else {
      process.stdout.write(`${label} · ${bits(result.bits)} · ${crack}\n`);
      result.findings.forEach(([kind, text]) =>
        process.stdout.write(`  ${kind === "good" ? "✓" : "!"} ${text}\n`)
      );
    }
    process.exit(result.score >= 4 ? 0 : 1);
  }

  const options = {
    length: o.length,
    uppercase: o.upper,
    lowercase: o.lower,
    numbers: o.digits,
    symbols: o.symbols,
    requireEach: true,
    excludeAmbiguous: o.readable,
    noRepeats: false,
    excludeChars: o.exclude,
    words: o.words,
    language: o.lang,
    ascii: !o.accents,
    separator: o.separator,
    capitalize: o.capitalize,
    addNumber: o.number,
    addSymbol: false,
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
        bits: entropy,
        label: core.SCORE_LABELS[score],
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
