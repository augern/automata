// A small QR Code generator (model 2, byte mode, error correction level M, versions 1–40) for the QR button:
// no server and no library. Pure: it returns the module matrix and an SVG path. Copied from the CPOS toolkit.
//
//   QR.encode('https://example.org/')  →  { version, size, modules }   (modules[row][col] is true for dark)
//   QR.pathData(qr.modules, 4)         →  the "d" of one SVG <path> that draws the dark modules, with a quiet zone
//
// The tables are the ones in the QR specification (ISO/IEC 18004); the method is the usual one: encode
// the text, add Reed-Solomon error correction, place the bits in the zigzag, then pick the mask with the
// lowest penalty.
const QR = (() => {

  // Per version 1…40, level M: the number of error-correction blocks, and the error-correction codewords in all.
  const EC_BLOCKS = [1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49];
  const EC_TOTAL  = [10,16,26,36,48,64,72,88,110,130,150,176,198,216,240,280,308,338,364,416,442,476,504,560,588,644,700,728,784,812,868,924,980,1036,1064,1120,1204,1260,1316,1372];
  const FORMAT_M = 0;   // the two format bits that say "level M"

  // ── Reed-Solomon over GF(256) (x^8 + x^4 + x^3 + x^2 + 1) ──
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function rsDivisor(degree) {
    const result = Array(degree - 1).fill(0).concat([1]);
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = mul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = mul(root, 2);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    const result = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      divisor.forEach((coef, i) => { result[i] ^= mul(coef, factor); });
    }
    return result;
  }

  // ── Sizes ──
  const sizeOf = ver => ver * 4 + 17;
  function alignPositions(ver) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const res = [6];
    for (let pos = sizeOf(ver) - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
    return res;
  }
  function rawModules(ver) {   // modules that can hold data or error correction
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { const a = Math.floor(ver / 7) + 2; n -= (25 * a - 10) * a - 55; if (ver >= 7) n -= 36; }
    return n;
  }
  const dataCodewords = ver => Math.floor(rawModules(ver) / 8) - EC_TOTAL[ver - 1];

  // ── Bits ──
  function dataBits(bytes, ver) {
    const bits = [];
    const push = (value, count) => { for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    push(0b0100, 4);                      // byte mode
    push(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(b => push(b, 8));
    const capacity = dataCodewords(ver) * 8;
    push(0, Math.min(4, capacity - bits.length));   // terminator
    push(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) push(pad, 8);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    return out;
  }

  function interleave(data, ver) {
    const nBlocks = EC_BLOCKS[ver - 1], eccLen = EC_TOTAL[ver - 1] / nBlocks;
    const raw = Math.floor(rawModules(ver) / 8), nShort = nBlocks - raw % nBlocks, shortLen = Math.floor(raw / nBlocks);
    const divisor = rsDivisor(eccLen), blocks = [];
    for (let i = 0, k = 0; i < nBlocks; i++) {
      const len = shortLen - eccLen + (i < nShort ? 0 : 1);
      const dat = data.slice(k, k + len); k += len;
      const ecc = rsRemainder(dat, divisor);
      if (i < nShort) dat.push(0);        // a placeholder so short and long blocks line up
      blocks.push(dat.concat(ecc));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) out.push(b[i]); });
    }
    return out;
  }

  // ── The matrix ──
  function build(codewords, ver) {
    const size = sizeOf(ver);
    const modules = Array.from({ length: size }, () => Array(size).fill(false));
    const fn = Array.from({ length: size }, () => Array(size).fill(false));
    const set = (x, y, dark) => { modules[y][x] = dark; fn[y][x] = true; };
    const bit = (v, i) => ((v >>> i) & 1) !== 0;

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }   // timing patterns
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const pos = alignPositions(ver);
    pos.forEach((cy, i) => pos.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));

    const drawFormat = mask => {
      const data = (FORMAT_M << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
      set(8, 7, bit(bits, 6)); set(8, 8, bit(bits, 7)); set(7, 8, bit(bits, 8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
      set(8, size - 8, true);             // the always-dark module
    };
    drawFormat(0);                        // reserve the format area before the data goes in
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) { const a = size - 11 + i % 3, b = Math.floor(i / 3); set(a, b, bit(bits, i)); set(b, a, bit(bits, i)); }
    }

    // the data and error correction, in the zigzag of two-module-wide columns from the bottom right
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && i < codewords.length * 8) { modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7)); i++; }
      }
    }

    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
    ];
    const applyMask = mask => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x]; };
    let best = 0, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      drawFormat(mask); applyMask(mask);
      const score = penalty(modules);
      applyMask(mask);
      if (score < bestScore) { bestScore = score; best = mask; }
    }
    drawFormat(best); applyMask(best);
    return modules;
  }

  // The four penalty rules of the specification: runs of five or more alike, 2x2 blocks, 1:1:3:1:1 finder-like
  // runs, and how far the share of dark modules is from half. The mask with the lowest total wins.
  function penalty(m) {
    const size = m.length;
    let points = 0, dark = 0;
    for (let a = 0; a < size; a++) {
      let runRow = 0, runCol = 0, lastRow = null, lastCol = null, bitsRow = 0, bitsCol = 0;
      for (let b = 0; b < size; b++) {
        const r = m[a][b], c = m[b][a];
        if (r) dark++;
        if (r === lastRow) runRow++; else { if (runRow >= 5) points += 3 + runRow - 5; lastRow = r; runRow = 1; }
        if (c === lastCol) runCol++; else { if (runCol >= 5) points += 3 + runCol - 5; lastCol = c; runCol = 1; }
        bitsRow = ((bitsRow << 1) & 0x7FF) | (r ? 1 : 0);
        bitsCol = ((bitsCol << 1) & 0x7FF) | (c ? 1 : 0);
        if (b >= 10) { if (bitsRow === 0x5D0 || bitsRow === 0x05D) points += 40; if (bitsCol === 0x5D0 || bitsCol === 0x05D) points += 40; }
      }
      if (runRow >= 5) points += 3 + runRow - 5;
      if (runCol >= 5) points += 3 + runCol - 5;
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const v = m[y][x];
      if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) points += 3;
    }
    return points + Math.abs(Math.ceil(dark * 100 / (size * size) / 5) - 10) * 10;
  }

  /** The smallest version (1–40) that holds `byteLength` bytes at level M, or null. */
  function versionFor(byteLength) {
    for (let ver = 1; ver <= 40; ver++) {
      if (4 + (ver <= 9 ? 8 : 16) + byteLength * 8 <= dataCodewords(ver) * 8) return ver;
    }
    return null;
  }

  /** Encode text (as UTF-8) into a QR symbol. Throws if it is too long for version 40 (2331 bytes). */
  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    const version = versionFor(bytes.length);
    if (version === null) throw new Error('Text is too long for a QR code');
    const modules = build(interleave(dataBits(bytes, version), version), version);
    return { version, size: modules.length, modules };
  }

  /** One SVG path (the "d" attribute) that draws every dark module as a unit square, shifted by a quiet zone of `margin` modules. */
  function pathData(modules, margin = 4) {
    const parts = [];
    modules.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!row[x]) continue;
        let end = x;
        while (end + 1 < row.length && row[end + 1]) end++;
        parts.push(`M${x + margin} ${y + margin}h${end - x + 1}v1h${x - end - 1}z`);
        x = end;
      }
    });
    return parts.join('');
  }

  return { encode, pathData, versionFor };
})();

