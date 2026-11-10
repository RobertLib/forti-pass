"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const CLI = path.join(__dirname, "..", "cli", "fortipass.js");
const { version } = require("../package.json");
const run = (args, input) =>
  spawnSync(process.execPath, [CLI].concat(args), { input: input, encoding: "utf8" });

/** Starts the CLI with piped stdio; resolves with its exit code and output. */
function start(args) {
  const child = spawn(process.execPath, [CLI].concat(args), { stdio: "pipe" });
  child.stdin.on("error", () => {}); // the CLI may stop reading early
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("fortipass did not exit"));
    }, 5000);
    child.on("exit", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  return { child, done };
}

test("prints one password per line on stdout and the verdict on stderr", () => {
  const result = run(["-l", "24", "-n", "3"]);
  assert.equal(result.status, 0);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 3);
  lines.forEach((line) => assert.equal(Array.from(line).length, 24));
  assert.match(result.stderr, /bits/);
});

test("defaults to a 16-character password, like the website", () => {
  const result = run(["-q"]);
  assert.equal(result.status, 0);
  assert.equal(Array.from(result.stdout.trim()).length, 16);
  assert.equal(result.stderr, "");
});

test("makes Czech passphrases without accents by default", () => {
  const result = run(["-w", "5", "--lang", "cs", "-q"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^([A-Z][a-z]+-){4}[A-Z][a-z]+\d$/);
  assert.equal(result.stderr, "");
});

test("passphrase options: a trailing symbol and random-digit separators", () => {
  const symbol = run(["-w", "4", "--symbol", "--json"]);
  const data = JSON.parse(symbol.stdout);
  assert.match(data.values[0], /^([A-Z][a-z]+-){3}[A-Z][a-z]+\d[!@#$%&*?+=]$/);
  assert.ok(Math.abs(data.bits - (4 * Math.log2(7776) + Math.log2(10) + Math.log2(10))) < 1e-9);

  const digits = run(["-w", "3", "-s", "digit", "--no-number", "-q"]);
  assert.match(digits.stdout.trim(), /^[A-Z][a-z]+\d[A-Z][a-z]+\d[A-Z][a-z]+$/);
});

test("--no-repeats uses every character at most once", () => {
  const value = run(["-l", "60", "--no-repeats", "-q"]).stdout.trim();
  assert.equal(new Set(value).size, 60);
  assert.equal(run(["-l", "11", "--no-repeats", "--no-upper", "--no-lower", "--no-symbols"]).status, 2);
});

test("JSON output carries the values, the entropy and a numeric score", () => {
  const result = run(["--pin", "6", "-n", "2", "--json"]);
  const data = JSON.parse(result.stdout);
  assert.equal(data.values.length, 2);
  data.values.forEach((pin) => assert.match(pin, /^\d{6}$/));
  assert.ok(Math.abs(data.bits - 6 * Math.log2(10)) < 1e-9);
  assert.equal(data.score, 1);
  assert.equal(data.label, "Very weak");

  const strong = JSON.parse(run(["-l", "32", "--json"]).stdout);
  assert.equal(strong.score, 5);
  assert.equal(strong.label, "Excellent");
});

test("--version prints the package version", () => {
  for (const flag of ["--version", "-V"]) {
    const result = run([flag]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, version + "\n");
  }
});

test("--help documents the options", () => {
  const help = run(["--help"]).stdout;
  ["--symbol", "--no-repeats", "--version", '"digit"', "3–12", "default 16"].forEach((text) =>
    assert.ok(help.includes(text), text)
  );
});

test("--check reads stdin and exits 1 for a weak password", () => {
  const weak = run(["--check", "--json"], "Summer2024!\n");
  assert.equal(weak.status, 1);
  assert.equal(JSON.parse(weak.stdout).score, 1);

  const strong = run(["--check"], "q7#Lr9$kVx2!mPz8&Tw4\n");
  assert.equal(strong.status, 0);
});

test("--check -q prints nothing and only sets the exit status", () => {
  const weak = run(["--check", "-q"], "Summer2024!\n");
  assert.deepEqual([weak.status, weak.stdout, weak.stderr], [1, "", ""]);
  const strong = run(["--check", "-q", "--json"], "q7#Lr9$kVx2!mPz8&Tw4");
  assert.deepEqual([strong.status, strong.stdout, strong.stderr], [0, "", ""]);
});

test("--check without a password is a usage error", () => {
  for (const input of ["", "\n", "\r\n"]) {
    const result = run(["--check"], input);
    assert.equal(result.status, 2, JSON.stringify(input));
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /no password/);
  }
});

test("--check stops at the first line break even if the pipe stays open", async () => {
  const { child, done } = start(["--check", "--json"]);
  child.stdin.write("q7#Lr9$kVx2!mPz8&Tw4\r\nsecond line\n");
  const result = await done; // stdin is never closed
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).score, 5);
});

test("--check caps endless input instead of running out of memory", async () => {
  const { child, done } = start(["--check", "--json"]);
  const chunk = "a".repeat(65536);
  // Keeps writing until the CLI stops reading (EPIPE) or exits.
  const feed = (err) => {
    if (!err && child.exitCode === null) child.stdin.write(chunk, feed);
  };
  feed();
  const result = await done;
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).score, 1);
});

test("a reader that stops early (| head) ends the CLI quietly", async () => {
  const { child, done } = start(["-l", "128", "-n", "1000"]);
  child.stdout.once("data", () => child.stdout.destroy());
  const result = await done;
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /EPIPE|Error/);
});

test("rejects bad options with exit code 2", () => {
  assert.equal(run(["--length", "2"]).status, 2);
  assert.equal(run(["--nope"]).status, 2);
  assert.equal(run(["-w", "5", "--pin", "4"]).status, 2);
  assert.equal(run(["-w", "13"]).status, 2);
  assert.equal(run(["-w", "12", "-q"]).status, 0);
  assert.equal(run(["--pin", "17"]).status, 2);
  assert.equal(run(["-l"]).status, 2);
  assert.equal(run(["--lang", "de"]).status, 2);
});

test("numbers must be plain digits", () => {
  for (const value of ["0x10", "1e1", " 8", "8.0", "+8"]) {
    assert.equal(run(["-l", value]).status, 2, value);
  }
  assert.equal(run(["-l", "8", "-q"]).status, 0);
});

test("an option for another kind of value is an error, not ignored", () => {
  const cases = [
    [["--pin", "4", "-l", "30"], /-l does not apply to PINs/],
    [["-w", "4", "--readable"], /--readable does not apply to passphrases/],
    [["-s", "_"], /-s does not apply to passwords/],
    [["--check", "-n", "3"], /-n does not apply to --check/],
  ];
  for (const [args, message] of cases) {
    const result = run(args, "");
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, message);
  }
  // Language, JSON and quiet go with anything.
  assert.equal(run(["-w", "4", "-s", "_", "--lang", "cs", "-q"]).status, 0);
  assert.equal(run(["--pin", "6", "--json"]).status, 0);
});
