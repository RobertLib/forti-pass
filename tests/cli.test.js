"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const CLI = path.join(__dirname, "..", "cli", "fortipass.js");
const run = (args, input) =>
  spawnSync(process.execPath, [CLI].concat(args), { input: input, encoding: "utf8" });

test("prints one password per line on stdout and the verdict on stderr", () => {
  const result = run(["-l", "24", "-n", "3"]);
  assert.equal(result.status, 0);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 3);
  lines.forEach((line) => assert.equal(Array.from(line).length, 24));
  assert.match(result.stderr, /bits/);
});

test("makes Czech passphrases without accents by default", () => {
  const result = run(["-w", "5", "--lang", "cs", "-q"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^([A-Z][a-z]+-){4}[A-Z][a-z]+\d$/);
  assert.equal(result.stderr, "");
});

test("JSON output carries the values and the entropy", () => {
  const result = run(["--pin", "6", "-n", "2", "--json"]);
  const data = JSON.parse(result.stdout);
  assert.equal(data.values.length, 2);
  data.values.forEach((pin) => assert.match(pin, /^\d{6}$/));
  assert.ok(Math.abs(data.bits - 6 * Math.log2(10)) < 1e-9);
});

test("--check reads stdin and exits 1 for a weak password", () => {
  const weak = run(["--check", "--json"], "Summer2024!\n");
  assert.equal(weak.status, 1);
  assert.equal(JSON.parse(weak.stdout).score, 1);

  const strong = run(["--check"], "q7#Lr9$kVx2!mPz8&Tw4\n");
  assert.equal(strong.status, 0);
});

test("rejects bad options with exit code 2", () => {
  assert.equal(run(["--length", "2"]).status, 2);
  assert.equal(run(["--nope"]).status, 2);
  assert.equal(run(["-w", "5", "--pin", "4"]).status, 2);
});
