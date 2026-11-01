const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Each tool with a Definitions pop-up: every source it cites is listed, and every listed source is cited.
for (const dir of fs.readdirSync(path.join(__dirname, "../tools"))) {
  const file = path.join(__dirname, "../tools", dir, "definitions.js");
  if (!fs.existsSync(file)) continue;
  test(`tools/${dir}/definitions.js: sources`, () => {
    const window = {};
    new Function("window", fs.readFileSync(file, "utf8"))(window);
    const d = window.TOOL_DEFINITIONS;
    const cited = new Set(d.sections.flatMap((s) => s.items.flatMap((i) => i.refs.map((r) => r.split(" ")[0]))));
    for (const k of cited) assert.ok(d.refs[k], `${k}: cited but not listed`);
    for (const k of Object.keys(d.refs)) assert.ok(cited.has(k), `${k}: listed but not cited`);
    for (const s of d.sections) for (const i of s.items) assert.ok(i.term && i.formal.length, i.term);
  });
}

const { load } = require("./load");
const T = load("tex.js");

test("tex: the subset renders as MathML, anything else is an error", () => {
  assert.equal(T.texToMathML("A_i^{*}"), '<math><mrow><msubsup><mi>A</mi><mi>i</mi><mrow><mo>*</mo></mrow></msubsup></mrow></math>');
  assert.match(T.texToMathML("\\mathrm{FIRST}(\\alpha) \\in \\Sigma"), /<mi mathvariant="normal">FIRST<\/mi><mo>\(<\/mo><mi>α<\/mi>/);
  assert.match(T.texToMathML("\\bigcup_{i} x"), /<munder><mo largeop="true">⋃<\/mo>/);
  assert.throws(() => T.texToMathML("\\frac{a}{b}"), /unknown/);
  assert.throws(() => T.texToMathML("{a"), /missing/);
});

test("every formula of a Definitions pop-up renders", () => {
  for (const dir of fs.readdirSync(path.join(__dirname, "../tools"))) {
    const file = path.join(__dirname, "../tools", dir, "definitions.js");
    if (!fs.existsSync(file)) continue;
    const window = {};
    new Function("window", fs.readFileSync(file, "utf8"))(window);
    for (const s of window.TOOL_DEFINITIONS.sections) for (const i of s.items) for (const f of i.formal) T.texToMathML(f);
  }
});
