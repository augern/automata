const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const run = (file) => {
  const window = {};
  new Function("window", fs.readFileSync(file, "utf8"))(window);
  return window;
};
const lib = run(path.join(__dirname, "../shared/def-library.js")).DEF_LIBRARY;
const toolFiles = fs.readdirSync(path.join(__dirname, "../tools")).map((d) => path.join(__dirname, "../tools", d, "definitions.js")).filter((f) => fs.existsSync(f));

test("the definitions library: every source an item cites is listed, every listed source is cited", () => {
  const cited = new Set();
  for (const [k, it] of Object.entries(lib.items)) {
    assert.ok(it.term && Array.isArray(it.formal) && Array.isArray(it.refs) && it.refs.length, k);
    for (const r of it.refs) { cited.add(r.split(" ")[0]); assert.ok(lib.sources[r.split(" ")[0]], `${k}: ${r}`); }
  }
  for (const k of Object.keys(lib.sources)) assert.ok(cited.has(k), `${k}: listed but not cited`);
});

test("every tool's Definitions pop-up names items of the library, and each of its tools is used", () => {
  const used = new Set();
  for (const f of toolFiles) {
    const d = run(f).TOOL_DEFINITIONS;
    for (const s of d.sections) for (const it of s.items) {
      if (typeof it === "string") { assert.ok(lib.items[it], `${f}: ${it}`); used.add(it); }
    }
  }
  for (const k of Object.keys(lib.items)) assert.ok(used.has(k), `${k}: in no tool's pop-up`);
});

const { load } = require("./load");
const T = load("tex.js");

test("tex: the subset renders as MathML, anything else is an error", () => {
  assert.equal(T.texToMathML("A_i^{*}"), '<math><mrow><msubsup><mi>A</mi><mi>i</mi><mrow><mo>*</mo></mrow></msubsup></mrow></math>');
  assert.match(T.texToMathML("\\mathrm{FIRST}(\\alpha) \\in \\Sigma"), /<mi mathvariant="normal">FIRST<\/mi><mo>\(<\/mo><mi>α<\/mi>/);
  assert.match(T.texToMathML("\\bigcup_{i} x"), /<munder><mo largeop="true">⋃<\/mo>/);
  assert.equal(T.texToMathML("\\Rightarrow^{*}"), '<math><mrow><msup><mo rspace="0">⇒</mo><mrow><mo>*</mo></mrow></msup></mrow></math>');
  assert.throws(() => T.texToMathML("\\frac{a}{b}"), /unknown/);
  assert.throws(() => T.texToMathML("{a"), /missing/);
});

test("every formula of the definitions library renders", () => {
  for (const it of Object.values(lib.items)) for (const f of it.formal) T.texToMathML(f);
});
