"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const qr = require("../qr.js");

const LEVELS = ["L", "M", "Q", "H"];

// ISO/IEC 18004 table 7: the most bytes that fit in byte mode, per version.
const CAPACITY = {
  L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586,
    644, 718, 792, 858, 929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628,
    1732, 1840, 1952, 2068, 2188, 2303, 2431, 2563, 2699, 2809, 2953],
  M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450,
    504, 560, 624, 666, 711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370,
    1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331],
  Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151, 177, 203, 241, 258, 292, 322,
    364, 394, 442, 482, 509, 565, 611, 661, 715, 751, 805, 868, 908, 982, 1030,
    1112, 1168, 1228, 1283, 1351, 1423, 1499, 1579, 1663],
  H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119, 137, 155, 177, 194, 220, 250, 280,
    310, 338, 382, 403, 439, 461, 511, 535, 593, 625, 658, 698, 742, 790, 842,
    898, 958, 983, 1051, 1093, 1139, 1219, 1273],
};

// ISO/IEC 18004 annex C: the 15-bit format information for masks 0–7.
const FORMAT = {
  L: ["111011111000100", "111001011110011", "111110110101010", "111100010011101",
    "110011000101111", "110001100011000", "110110001000001", "110100101110110"],
  M: ["101010000010010", "101000100100101", "101111001111100", "101101101001011",
    "100010111111001", "100000011001110", "100111110010111", "100101010100000"],
  Q: ["011010101011111", "011000001101000", "011111100110001", "011101000000110",
    "010010010110100", "010000110000011", "010111011011010", "010101111101101"],
  H: ["001011010001001", "001001110111110", "001110011100111", "001100111010000",
    "000011101100010", "000001001010101", "000110100001100", "000100000111011"],
};

const hex = (bytes) => bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");

// Reads both copies of the format information, bit 0 first, from the
// positions in ISO/IEC 18004 figure 25.
function readFormat(sym) {
  const n = sym.size;
  const first = [];
  const second = [];
  for (let i = 0; i <= 5; i++) first.push([i, 8]);
  first.push([7, 8], [8, 8], [8, 7]);
  for (let i = 9; i < 15; i++) first.push([8, 14 - i]);
  for (let i = 0; i < 8; i++) second.push([8, n - 1 - i]);
  for (let i = 8; i < 15; i++) second.push([n - 15 + i, 8]);
  const read = (cells) =>
    cells.reduce((acc, [row, col], i) => acc | (sym.modules[row][col] ? 1 << i : 0), 0);
  return [read(first), read(second)];
}

function readVersionInfo(sym) {
  const n = sym.size;
  let upperRight = 0;
  let lowerLeft = 0;
  for (let i = 0; i < 18; i++) {
    const a = n - 11 + (i % 3);
    const b = Math.floor(i / 3);
    if (sym.modules[b][a]) upperRight |= 1 << i;
    if (sym.modules[a][b]) lowerLeft |= 1 << i;
  }
  return [upperRight, lowerLeft];
}

// Remainder of polynomial division over GF(2), for checking BCH codewords.
function gf2Mod(value, poly) {
  const degree = 31 - Math.clz32(poly);
  for (let bit = 31 - Math.clz32(value); bit >= degree; bit--) {
    if ((value >>> bit) & 1) value ^= poly << (bit - degree);
  }
  return value;
}

// GF(256) multiply by shift-and-add, independent of qr.js's log tables.
function gfMul(a, b) {
  let product = 0;
  for (; b; b >>= 1) {
    if (b & 1) product ^= a;
    a = a & 0x80 ? (a << 1) ^ 0x11d : a << 1;
  }
  return product;
}

/* ------------------------------------------------------------- structure */

test("encodes a short string as a 21×21 version 1-M symbol", () => {
  const sym = qr.encode("HELLO WORLD");
  assert.equal(sym.version, 1);
  assert.equal(sym.ecc, "M");
  assert.equal(sym.size, 21);
  assert.equal(sym.modules.length, 21);
  for (const row of sym.modules) {
    assert.equal(row.length, 21);
    assert.ok(row.every((cell) => typeof cell === "boolean"));
  }
  assert.deepEqual(qr.encode("HELLO WORLD", { ecc: "M" }), sym, "deterministic");
});

test("picks the smallest version that fits, at the spec's byte capacities", () => {
  for (const level of LEVELS) {
    CAPACITY[level].forEach((max, i) => {
      const version = i + 1;
      // mask 0 skips the penalty search, which is irrelevant to sizing.
      const full = qr.encode("x".repeat(max), { ecc: level, mask: 0 });
      assert.equal(full.version, version, level + " " + max + " bytes");
      assert.equal(full.size, 17 + 4 * version);
      if (version < 40) {
        const over = qr.encode("x".repeat(max + 1), { ecc: level, mask: 0 });
        assert.equal(over.version, version + 1, level + " " + (max + 1) + " bytes");
      }
    });
  }
});

test("version grows with the input and with the error-correction level", () => {
  let previous = 0;
  for (let length = 0; length <= 600; length += 25) {
    const sym = qr.encode("a".repeat(length), { mask: 0 });
    assert.ok(sym.version >= previous);
    assert.equal(sym.size, 17 + 4 * sym.version);
    previous = sym.version;
  }
  const text = "WIFI:T:WPA;S:Home;P:correct horse battery staple;;";
  const versions = LEVELS.map((ecc) => qr.encode(text, { ecc }).version);
  assert.deepEqual(versions, versions.slice().sort((a, b) => a - b));
  assert.ok(versions[3] > versions[0]);
});

test("draws finder patterns with separators in three corners only", () => {
  for (const text of ["hi", "x".repeat(300)]) {
    const sym = qr.encode(text);
    const n = sym.size;
    const finderAt = (top, left) => {
      for (let dy = -1; dy <= 7; dy++) {
        for (let dx = -1; dx <= 7; dx++) {
          const row = top + dy;
          const col = left + dx;
          if (row < 0 || col < 0 || row >= n || col >= n) continue;
          const ring = Math.max(Math.abs(dy - 3), Math.abs(dx - 3));
          if (sym.modules[row][col] !== (ring !== 2 && ring !== 4)) return false;
        }
      }
      return true;
    };
    assert.ok(finderAt(0, 0), "top-left");
    assert.ok(finderAt(0, n - 7), "top-right");
    assert.ok(finderAt(n - 7, 0), "bottom-left");
    assert.ok(!finderAt(n - 7, n - 7), "no finder bottom-right");
  }
});

test("timing patterns alternate between the finders", () => {
  for (const length of [1, 100, 1000]) {
    const sym = qr.encode("t".repeat(length), { ecc: "L" });
    for (let i = 8; i < sym.size - 8; i++) {
      assert.equal(sym.modules[6][i], i % 2 === 0, "row 6, column " + i);
      assert.equal(sym.modules[i][6], i % 2 === 0, "column 6, row " + i);
    }
  }
});

test("dark module and alignment patterns sit where the spec puts them", () => {
  const sym = qr.encode("x".repeat(CAPACITY.L[6]), { ecc: "L" }); // version 7
  assert.equal(sym.version, 7);
  assert.equal(sym.modules[4 * 7 + 9][8], true, "dark module");
  for (const cy of [6, 22, 38]) {
    for (const cx of [6, 22, 38]) {
      if (Math.min(cx, cy) === 6 && Math.max(cx, cy) !== 22) continue; // finders
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          assert.equal(sym.modules[cy + dy][cx + dx], ring !== 1, cx + "," + cy);
        }
      }
    }
  }
});

/* ------------------------------------------------------- format, version */

test("format information is readable and matches the level and mask", () => {
  const levelBits = { L: 1, M: 0, Q: 3, H: 2 };
  for (const ecc of LEVELS) {
    for (let mask = 0; mask < 8; mask++) {
      const sym = qr.encode("Wi-Fi", { ecc, mask });
      const [first, second] = readFormat(sym);
      assert.equal(first, second, "both copies agree");
      assert.equal(first, parseInt(FORMAT[ecc][mask], 2), ecc + " mask " + mask);
      const data = first ^ 0x5412;
      assert.equal(gf2Mod(data, 0x537), 0, "valid BCH(15,5)");
      assert.equal(data >>> 13, levelBits[ecc]);
      assert.equal((data >>> 10) & 7, mask);
    }
    // And with the mask the encoder picked itself.
    const auto = qr.encode("WIFI:T:WPA;S:Cafe;P:secret;;", { ecc });
    const data = readFormat(auto)[0] ^ 0x5412;
    assert.equal(data >>> 13, levelBits[ecc]);
    assert.equal((data >>> 10) & 7, auto.mask);
  }
});

test("version information appears from version 7 and matches annex D", () => {
  const annexD = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3, 40: 0x28c69 };
  for (const version of Object.keys(annexD).map(Number)) {
    const sym = qr.encode("x".repeat(CAPACITY.H[version - 1]), { ecc: "H" });
    assert.equal(sym.version, version);
    const [upperRight, lowerLeft] = readVersionInfo(sym);
    assert.equal(upperRight, annexD[version], "version " + version);
    assert.equal(lowerLeft, annexD[version], "version " + version);
    assert.equal(gf2Mod(upperRight, 0x1f25), 0, "valid BCH(18,6)");
  }
});

/* ------------------------------------------------------------- codewords */

test("Reed–Solomon matches the spec's worked example (annex I, 1-M)", () => {
  // "01234567" in numeric mode, already padded to 16 data codewords.
  const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11,
    0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  assert.equal(
    hex(qr._reedSolomon(data, 10)),
    "a5 24 d4 c1 ed 36 c7 87 2c 55"
  );
});

test("Reed–Solomon codewords have zero syndromes for every degree used", () => {
  for (const degree of [7, 10, 13, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30]) {
    const data = Array.from({ length: 40 }, (_, i) => (i * 37 + degree * 11) & 255);
    const codeword = data.concat(qr._reedSolomon(data, degree));
    for (let i = 0, alpha = 1; i < degree; i++, alpha = gfMul(alpha, 2)) {
      // Horner evaluation at α^i; every root of the generator must vanish.
      const syndrome = codeword.reduce((acc, c) => gfMul(acc, alpha) ^ c, 0);
      assert.equal(syndrome, 0, "degree " + degree + ", root " + i);
    }
  }
});

test("byte-mode codewords for 'hello world' at 1-M (known answer)", () => {
  // Data: mode 0100, count 00001011, the 11 bytes, terminator 0000, then
  // pad codewords EC 11 EC. ECC computed independently and cross-checked
  // against another encoder's output for the same input.
  assert.equal(
    hex(qr._codewords("hello world", "M")),
    "40 b6 86 56 c6 c6 f2 07 76 f7 26 c6 40 ec 11 ec " +
      "39 3a dc 20 d5 08 c5 fa 3f c1"
  );
});

test("accepts UTF-8 text and counts its bytes, not its characters", () => {
  const text = "Žluťoučký kůň";
  const bytes = Array.from(Buffer.from(text, "utf8"));
  assert.equal(bytes.length, 19);
  const sym = qr.encode(text, { ecc: "L" });
  assert.equal(sym.version, 2, "19 bytes exceed the 17 that fit in 1-L");
  // Version 2-L is a single block, so the data codewords lead the stream.
  const cw = qr._codewords(text, "L");
  const bits = cw.map((b) => b.toString(2).padStart(8, "0")).join("");
  assert.equal(bits.slice(0, 4), "0100", "byte mode");
  assert.equal(parseInt(bits.slice(4, 12), 2), 19, "byte count");
  const payload = [];
  for (let i = 0; i < 19; i++) payload.push(parseInt(bits.slice(12 + 8 * i, 20 + 8 * i), 2));
  assert.deepEqual(payload, bytes);
});

test("the fallback UTF-8 encoder matches TextEncoder", () => {
  const samples = ["", "plain", "Příliš žluťoučký kůň", "€ ✓ 日本語", "😀🔒",
    "a\uD800b", "\uDC00", "x\uD83D", "߿ࠀ￿\u{10000}\u{10ffff}"];
  for (const s of samples) {
    assert.deepEqual(qr._utf8(s), Array.from(new TextEncoder().encode(s)), JSON.stringify(s));
  }
});

/* ---------------------------------------------------------------- limits */

test("rejects text that does not fit in version 40", () => {
  for (const ecc of LEVELS) {
    const max = CAPACITY[ecc][39];
    assert.equal(qr.encode("x".repeat(max), { ecc, mask: 0 }).size, 177);
    assert.throws(() => qr.encode("x".repeat(max + 1), { ecc }), (err) =>
      err instanceof RangeError && /too long/.test(err.message) &&
      err.message.includes(String(max)));
  }
  // Multi-byte characters count by their UTF-8 length.
  assert.throws(() => qr.encode("ž".repeat(1500), { ecc: "L" }), RangeError);
});

test("rejects bad arguments", () => {
  assert.throws(() => qr.encode("x", { ecc: "X" }), RangeError);
  assert.throws(() => qr.encode("x", { ecc: "m" }), RangeError);
  assert.throws(() => qr.encode("x", { mask: 8 }), RangeError);
  assert.throws(() => qr.encode("x", { mask: "1" }), RangeError);
  assert.throws(() => qr.encode(42), TypeError);
  assert.throws(() => qr.toPath(qr.encode("x"), -1), RangeError);
  assert.throws(() => qr.toPath(qr.encode("x"), 1.5), RangeError);
});

/* ------------------------------------------------------------ masks, svg */

test("matches another encoder module for module ('hello world', 1-M)", () => {
  // Produced by macOS CoreImage's CIQRCodeGenerator, which chose mask 2 too.
  const reference = [
    "#######..#.##.#######",
    "#.....#...#...#.....#",
    "#.###.#.####..#.###.#",
    "#.###.#.###.#.#.###.#",
    "#.###.#.#.#.#.#.###.#",
    "#.....#.#..#..#.....#",
    "#######.#.#.#.#######",
    "........#.#..........",
    "#.#####..#.#..#####..",
    ".##.##.#.#.########.#",
    "#.#.####.##.###..###.",
    "#.#..#...#.###..###..",
    "...#.#####..###.....#",
    "........#.#.#...##..#",
    "#######....#..#...##.",
    "#.....#.#....#.#.####",
    "#.###.#.#..#..##....#",
    "#.###.#.##..######...",
    "#.###.#.##..#..#..#..",
    "#.....#..##.##..###..",
    "#######.##.##.#.#..#.",
  ];
  const sym = qr.encode("hello world", { ecc: "M" });
  assert.equal(sym.mask, 2);
  assert.deepEqual(sym.modules.map((row) => row.map((c) => (c ? "#" : ".")).join("")), reference);
});

test("each mask flips exactly the modules the spec's condition selects", () => {
  // ISO/IEC 18004 table 10, with i = row and j = column.
  const conditions = [
    (i, j) => (i + j) % 2 === 0,
    (i) => i % 2 === 0,
    (i, j) => j % 3 === 0,
    (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
    (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
    (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
    (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0,
  ];
  const text = "WIFI:T:WPA;S:Mask test;P:" + "q".repeat(120) + ";;"; // version 8
  const symbols = conditions.map((_, mask) => qr.encode(text, { ecc: "M", mask }));
  const n = symbols[0].size;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === 8 || j === 8) continue; // format information differs per mask
      const raw = symbols.map((s, mask) => s.modules[i][j] !== conditions[mask](i, j));
      const plain = symbols.map((s) => s.modules[i][j]);
      // A data module unmasks to the same bit under every mask; a function
      // module is never masked at all.
      const same = (list) => list.every((v) => v === list[0]);
      assert.ok(same(raw) || same(plain), "row " + i + ", column " + j);
    }
  }
});

test("chooses the mask with the lowest penalty", () => {
  for (const text of ["hello", "WIFI:T:WPA;S:Kavárna;P:heslo123;;", "z".repeat(200)]) {
    for (const ecc of LEVELS) {
      const chosen = qr.encode(text, { ecc });
      const best = qr._penalty(chosen.modules);
      for (let mask = 0; mask < 8; mask++) {
        const other = qr._penalty(qr.encode(text, { ecc, mask }).modules);
        assert.ok(best <= other, ecc + " mask " + chosen.mask + " vs " + mask);
      }
    }
  }
});

test("toPath emits only path commands and numbers, one per dark run", () => {
  const sym = qr.encode("WIFI:T:WPA;S:Home;P:secret;;");
  const d = qr.toPath(sym);
  assert.match(d, /^(M\d+ \d+h\d+v1h-\d+z)+$/);

  // Repaint the path onto a grid and compare with the modules.
  const paint = (path, border) => {
    const n = sym.size + 2 * border;
    const grid = Array.from({ length: n }, () => new Array(n).fill(false));
    for (const [, x, y, w] of path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      for (let i = 0; i < Number(w); i++) {
        assert.equal(grid[y][Number(x) + i], false, "runs do not overlap");
        grid[y][Number(x) + i] = true;
      }
    }
    return grid;
  };
  const withBorder = paint(d, 4);
  for (let y = 0; y < sym.size; y++) {
    for (let x = 0; x < sym.size; x++) {
      assert.equal(withBorder[y + 4][x + 4], sym.modules[y][x]);
    }
  }
  assert.ok(withBorder.slice(0, 4).every((row) => row.every((c) => !c)), "quiet zone");
  assert.deepEqual(paint(qr.toPath(sym, 0), 0), sym.modules);
});
