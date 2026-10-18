const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const QR = load("qr.js").QR;

const SAMPLES = [
  'a', 'https://example.org/', 'http://192.168.1.5:3000/games/disk-scheduling-game.html?server=192.168.1.5:3000&seed=P7QR2M',
  'Räksmörgås ✓', 'x'.repeat(14), 'x'.repeat(15), 'y'.repeat(100), 'z'.repeat(200),
  Array.from({ length: 330 }, (_, i) => String.fromCharCode(33 + (i * 7) % 90)).join(''),
  Array.from({ length: 1000 }, (_, i) => String.fromCharCode(33 + (i * 13) % 90)).join(''),
  Array.from({ length: 1400 }, (_, i) => String.fromCharCode(33 + (i * 11) % 90)).join(''),   // version 32, which has its own alignment spacing
  Array.from({ length: 2331 }, (_, i) => String.fromCharCode(33 + (i * 17) % 90)).join(''),   // the most version 40 holds
];

test('versions: the smallest one that fits, and a size of 17 + 4 modules per version', () => {
  assert.equal(QR.encode('x'.repeat(14)).version, 1, 'version 1 holds 14 bytes at level M');
  assert.equal(QR.encode('x'.repeat(15)).version, 2);
  assert.equal(QR.versionFor(2331), 40);
  assert.equal(QR.versionFor(2332), null);
  for (const s of SAMPLES) { const q = QR.encode(s); assert.equal(q.size, 17 + 4 * q.version); assert.equal(q.modules.length, q.size); }
  assert.throws(() => QR.encode('x'.repeat(2332)), /too long/);
});

test('structure: three finder patterns, timing patterns, the dark module', () => {
  for (const s of SAMPLES) {
    const { modules: m, size } = QR.encode(s);
    const finder = (x0, y0) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const edge = x === 0 || x === 6 || y === 0 || y === 6, core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      assert.equal(m[y0 + y][x0 + x], edge || core, `finder at ${x0},${y0}`);
    } };
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    for (let i = 8; i < size - 8; i++) { assert.equal(m[6][i], i % 2 === 0, 'row timing'); assert.equal(m[i][6], i % 2 === 0, 'column timing'); }
    assert.equal(m[size - 8][8], true, 'dark module');
  }
});

test('the symbol is deterministic and different texts give different symbols', () => {
  assert.deepEqual(QR.encode('https://example.org/'), QR.encode('https://example.org/'));
  assert.notDeepEqual(QR.encode('https://example.org/a').modules, QR.encode('https://example.org/b').modules);
});

test('pathData: one closed rectangle per run of dark modules, shifted by the quiet zone', () => {
  const m = [[true, true, false], [false, true, false], [false, false, false]];
  assert.equal(QR.pathData(m, 0), 'M0 0h2v1h-2zM1 1h1v1h-1z');
  assert.equal(QR.pathData(m, 4), 'M4 4h2v1h-2zM5 5h1v1h-1z');
  const q = QR.encode('https://example.org/');
  const area = QR.pathData(q.modules, 0).split('M').filter(Boolean).reduce((n, seg) => n + Number(/h(\d+)/.exec(seg)[1]), 0);
  assert.equal(area, q.modules.flat().filter(Boolean).length, 'the path covers exactly the dark modules');
});
