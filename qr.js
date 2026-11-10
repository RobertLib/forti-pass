/* ==========================================================================
   FortiPass QR — a small QR Code (ISO/IEC 18004) encoder for Wi-Fi join
   codes. The site's CSP forbids network requests, so a CDN library is not an
   option. Like core.js it never touches the DOM, so the same file runs in
   the browser (as window.FortiPassQR) and under `node --test`.
   ========================================================================== */

(function (root) {
  "use strict";

  /* ---------------------------------------------------------------- tables */

  // The two format-information bits for each level are not in L-M-Q-H order.
  const LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };
  const LEVEL_INDEX = { L: 0, M: 1, Q: 2, H: 3 };

  // ISO/IEC 18004 table 9, one row per level (L, M, Q, H), each split into
  // versions 1–20 and 21–40; index 0 is unused. Only these two columns are
  // stored: the data codeword counts and the short/long block split follow
  // from them and the symbol's module count.
  const ECC_PER_BLOCK = [
    [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
      28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
      26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
      28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
      30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const BLOCK_COUNT = [
    [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
      8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
      17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
      23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
      25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  // Mask conditions with x = column and y = row; true flips a data module.
  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  /* ---------------------------------------------------------- reed-solomon */

  // GF(256) over the QR polynomial x^8 + x^4 + x^3 + x^2 + 1. EXP is doubled
  // in length so a product never needs a "mod 255" on the summed logs.
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = EXP[i + 255] = x;
    LOG[x] = i;
    x = x & 0x80 ? (x << 1) ^ 0x11d : x << 1;
  }
  const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  // (x - α^0)(x - α^1)…(x - α^(n-1)), highest power first. Only 13 distinct
  // degrees occur across all versions, so each is built once and cached.
  const generators = {};
  function generator(degree) {
    if (generators[degree]) return generators[degree];
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return (generators[degree] = poly);
  }

  /** Error-correction codewords: the remainder of data·x^n ÷ generator. */
  function reedSolomon(data, degree) {
    const gen = generator(degree);
    const rem = new Array(degree).fill(0);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ rem.shift();
      rem.push(0);
      for (let j = 0; j < degree; j++) rem[j] ^= gfMul(gen[j + 1], factor);
    }
    return rem;
  }

  /* ------------------------------------------------------------- codewords */

  /**
   * UTF-8 for runtimes without TextEncoder. Lone surrogates become U+FFFD as
   * they do in TextEncoder, so both paths agree byte for byte and a symbol
   * never depends on which one ran.
   */
  function utf8(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let c = text.codePointAt(i);
      if (c > 0xffff) i++; // a surrogate pair is two UTF-16 units
      else if (c >= 0xd800 && c < 0xe000) c = 0xfffd;
      // Continuation bytes after the lead byte, each carrying 6 bits.
      const extra = c < 0x80 ? 0 : c < 0x800 ? 1 : c < 0x10000 ? 2 : 3;
      out.push([0, 0xc0, 0xe0, 0xf0][extra] | (c >> (6 * extra)));
      for (let k = extra - 1; k >= 0; k--) out.push(0x80 | ((c >> (6 * k)) & 63));
    }
    return out;
  }

  function toBytes(text) {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    return typeof TextEncoder === "function"
      ? Array.from(new TextEncoder().encode(text))
      : utf8(text);
  }

  // Modules left for codewords once the function patterns, format and
  // version information are drawn. A closed form instead of another table;
  // it can leave 0–7 remainder bits that do not make a whole codeword.
  function rawModules(version) {
    let n = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const align = Math.floor(version / 7) + 2;
      n -= (25 * align - 10) * align - 55;
      if (version >= 7) n -= 36;
    }
    return n;
  }

  function layout(version, level) {
    const e = LEVEL_INDEX[level];
    const blocks = BLOCK_COUNT[e][version];
    const ecc = ECC_PER_BLOCK[e][version];
    const total = Math.floor(rawModules(version) / 8);
    return { blocks, ecc, total, data: total - blocks * ecc };
  }

  // Byte mode only: Wi-Fi strings are mostly mixed-case text, where numeric
  // and alphanumeric segments save a version at best and need a segmenting
  // optimiser. The header is the 4-bit mode and an 8- or 16-bit byte count.
  const headerBits = (version) => (version < 10 ? 12 : 20);

  function chooseVersion(length, level) {
    for (let version = 1; version <= 40; version++) {
      const capacity = 8 * layout(version, level).data;
      if (headerBits(version) + 8 * length <= capacity) return version;
    }
    const max = Math.floor((8 * layout(40, level).data - 20) / 8);
    throw new RangeError(
      "Text is too long for a QR code: " + length + " bytes of UTF-8, but " +
        "at most " + max + " fit with error correction level " + level + "."
    );
  }

  function dataCodewords(bytes, version, capacity) {
    const bits = [];
    const push = (value, length) => {
      for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    push(0b0100, 4);
    push(bytes.length, headerBits(version) - 4);
    bytes.forEach((byte) => push(byte, 8));
    // The terminator is up to four zero bits (fewer if the symbol is full),
    // then zero bits up to a byte boundary and alternating pad codewords.
    push(0, Math.min(4, 8 * capacity - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) {
      out.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit));
    }
    for (let pad = 0xec; out.length < capacity; pad ^= 0xec ^ 0x11) {
      out.push(pad);
    }
    return out;
  }

  /**
   * Splits the data into blocks, appends each block's ECC and interleaves
   * them column by column, so a burst of damage (a smudge, a glare spot)
   * spreads over many blocks instead of exhausting one block's correction.
   */
  function codewords(bytes, version, level) {
    const l = layout(version, level);
    const data = dataCodewords(bytes, version, l.data);
    const shortBlocks = l.blocks - (l.total % l.blocks);
    const shortLength = Math.floor(l.total / l.blocks) - l.ecc;
    const blocks = [];
    for (let b = 0, at = 0; b < l.blocks; b++) {
      const length = shortLength + (b < shortBlocks ? 0 : 1);
      const chunk = data.slice(at, at + length);
      at += length;
      blocks.push({ data: chunk, ecc: reedSolomon(chunk, l.ecc) });
    }
    const out = [];
    for (let i = 0; i <= shortLength; i++) {
      blocks.forEach((block) => {
        if (i < block.data.length) out.push(block.data[i]);
      });
    }
    for (let i = 0; i < l.ecc; i++) {
      blocks.forEach((block) => out.push(block.ecc[i]));
    }
    return out;
  }

  /* ---------------------------------------------------------------- matrix */

  // Alignment pattern centres along one axis: evenly spaced back from the far
  // edge, with any slack absorbed by the first gap after coordinate 6.
  function alignmentPositions(version) {
    if (version === 1) return [];
    const count = Math.floor(version / 7) + 2;
    const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
    const result = [6];
    for (let pos = 4 * version + 10; result.length < count; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  }

  // BCH(15,5) and BCH(18,6) codes: the format and version bits are protected
  // so a reader can still learn them from a damaged symbol.
  function bch(value, poly, degree) {
    let rem = value;
    for (let i = 0; i < degree; i++) {
      rem = (rem << 1) ^ ((rem >>> (degree - 1)) * poly);
    }
    return (value << degree) | rem;
  }

  function createMatrix(version) {
    const size = 17 + 4 * version;
    const grid = () =>
      Array.from({ length: size }, () => new Array(size).fill(false));
    const m = { size, modules: grid(), reserved: grid() };
    m.set = (x, y, dark) => {
      m.modules[y][x] = dark;
      m.reserved[y][x] = true;
    };
    // Concentric squares; `isDark` gets the ring index (0 = centre).
    const square = (cx, cy, radius, isDark) => {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) {
            m.set(x, y, isDark(Math.max(Math.abs(dx), Math.abs(dy))));
          }
        }
      }
    };

    for (let i = 0; i < size; i++) {
      m.set(6, i, i % 2 === 0);
      m.set(i, 6, i % 2 === 0);
    }
    // Finders are drawn 9×9 so the light separator around them comes along;
    // the part that falls outside the symbol is clipped by `square`.
    const finder = (ring) => ring !== 2 && ring !== 4;
    square(3, 3, 4, finder);
    square(size - 4, 3, 4, finder);
    square(3, size - 4, 4, finder);
    const align = alignmentPositions(version);
    const last = align.length - 1;
    align.forEach((cy, i) =>
      align.forEach((cx, j) => {
        // The three corners that hold finder patterns get no alignment.
        const corner =
          (i === 0 && (j === 0 || j === last)) || (i === last && j === 0);
        if (!corner) square(cx, cy, 2, (ring) => ring !== 1);
      })
    );
    if (version >= 7) {
      const bits = bch(version, 0x1f25, 12);
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        m.set(a, b, dark);
        m.set(b, a, dark);
      }
    }
    return m;
  }

  // The first call, before the data is placed, doubles as the reservation of
  // both format areas; it also sets the always-dark module.
  function drawFormat(m, level, mask) {
    const bits = bch((LEVEL_BITS[level] << 3) | mask, 0x537, 10) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) === 1;
    const size = m.size;
    for (let i = 0; i <= 5; i++) m.set(8, i, bit(i));
    m.set(8, 7, bit(6));
    m.set(8, 8, bit(7));
    m.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) m.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) m.set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) m.set(8, size - 15 + i, bit(i));
    m.set(8, size - 8, true);
  }

  // Two-module-wide columns from the bottom-right corner, alternately upward
  // and downward, skipping the vertical timing pattern in column 6. Leftover
  // remainder modules stay light (zero bits) and are masked like the rest.
  function placeData(m, data) {
    const size = m.size;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      const upward = ((right + 1) & 2) === 0;
      for (let vert = 0; vert < size; vert++) {
        const y = upward ? size - 1 - vert : vert;
        for (let x = right; x > right - 2; x--) {
          if (!m.reserved[y][x] && i < data.length * 8) {
            m.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }
  }

  // XOR, so applying the same mask twice restores the unmasked symbol.
  function applyMask(m, mask) {
    const flip = MASKS[mask];
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        if (!m.reserved[y][x] && flip(x, y)) m.modules[y][x] = !m.modules[y][x];
      }
    }
  }

  /* --------------------------------------------------------------- penalty */

  // Rules 1 and 3 for one row or column. Outside the symbol counts as light,
  // because that is what a scanner sees in the quiet zone.
  function linePenalty(line) {
    const n = line.length;
    const light = (from, to) => !line.slice(Math.max(from, 0), to).some(Boolean);
    let score = 0;
    for (let i = 0, run = 0; i < n; i++) {
      run = i > 0 && line[i] === line[i - 1] ? run + 1 : 1;
      if (run === 5) score += 3;
      else if (run > 5) score += 1;
    }
    for (let i = 0; i + 7 <= n; i++) {
      const core = line[i] && !line[i + 1] && line[i + 2] && line[i + 3] &&
        line[i + 4] && !line[i + 5] && line[i + 6];
      if (core && light(i - 4, i)) score += 40;
      if (core && light(i + 7, i + 11)) score += 40;
    }
    return score;
  }

  /**
   * The standard four-rule score: long runs, 2×2 blocks, 1:1:3:1:1 patterns
   * a scanner could mistake for a finder, and dark/light imbalance. Lower
   * reads more reliably, which is the whole reason masks exist.
   */
  function penalty(modules) {
    const size = modules.length;
    let score = 0;
    let dark = 0;
    for (let y = 0; y < size; y++) {
      score += linePenalty(modules[y]);
      score += linePenalty(modules.map((row) => row[y]));
      for (let x = 0; x < size; x++) {
        const c = modules[y][x];
        if (c) dark++;
        if (x + 1 < size && y + 1 < size && c === modules[y][x + 1] &&
            c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
          score += 3;
        }
      }
    }
    // 10 points for every full 5% that the dark share strays from 50%.
    const total = size * size;
    return score + Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  }

  /* ------------------------------------------------------------------- api */

  function readLevel(ecc) {
    const level = ecc === undefined ? "M" : ecc;
    if (!Object.prototype.hasOwnProperty.call(LEVEL_BITS, level)) {
      throw new RangeError('ecc must be "L", "M", "Q" or "H"');
    }
    return level;
  }

  /**
   * @param {string} text  encoded in byte mode as UTF-8
   * @param {{ecc?: "L"|"M"|"Q"|"H", mask?: number}} [options]  `mask` (0–7)
   *   skips the penalty search; it exists for tests.
   * @returns {{size: number, version: number, ecc: string, mask: number,
   *   modules: boolean[][]}}  modules[row][column], true = dark
   */
  function encode(text, options) {
    const opts = options || {};
    const level = readLevel(opts.ecc);
    const valid = Number.isInteger(opts.mask) && opts.mask >= 0 && opts.mask < 8;
    if (opts.mask !== undefined && !valid) {
      throw new RangeError("mask must be an integer from 0 to 7");
    }
    const bytes = toBytes(text);
    const version = chooseVersion(bytes.length, level);
    const m = createMatrix(version);
    drawFormat(m, level, 0);
    placeData(m, codewords(bytes, version, level));

    let mask = opts.mask;
    if (mask === undefined) {
      let best = Infinity;
      for (let candidate = 0; candidate < 8; candidate++) {
        applyMask(m, candidate);
        drawFormat(m, level, candidate);
        const score = penalty(m.modules);
        if (score < best) {
          best = score;
          mask = candidate;
        }
        applyMask(m, candidate);
      }
    }
    applyMask(m, mask);
    drawFormat(m, level, mask);
    return { size: m.size, version, ecc: level, mask, modules: m.modules };
  }

  /**
   * SVG path data for the dark modules, shifted right and down by a
   * `border`-module quiet zone. Each horizontal run becomes one rectangle,
   * which roughly halves the string compared with one square per module.
   */
  function toPath(qr, border) {
    const pad = border === undefined ? 4 : border;
    if (!Number.isInteger(pad) || pad < 0) {
      throw new RangeError("border must be a non-negative integer");
    }
    let d = "";
    qr.modules.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!row[x]) continue;
        const start = x;
        while (x + 1 < row.length && row[x + 1]) x++;
        const w = x - start + 1;
        d += "M" + (start + pad) + " " + (y + pad) + "h" + w + "v1h-" + w + "z";
      }
    });
    return d;
  }

  const api = {
    encode: encode,
    toPath: toPath,
    // Internals, exposed so the tests can check known-answer vectors.
    _codewords: (text, ecc) => {
      const level = readLevel(ecc);
      const bytes = toBytes(text);
      return codewords(bytes, chooseVersion(bytes.length, level), level);
    },
    _reedSolomon: reedSolomon,
    _penalty: penalty,
    _utf8: utf8,
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.FortiPassQR = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
