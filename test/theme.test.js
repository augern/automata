// Contrast of the colour tokens in both themes (WCAG 2.x relative luminance).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "shared", "shared.css"), "utf8");

// --token: value; declarations inside the block that starts at `selector {`
function tokens(selector) {
  const start = css.indexOf(selector + " {");
  assert.ok(start >= 0, "no block " + selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const NAMED = { black: "#000000", white: "#ffffff", darkgray: "#a9a9a9" };
function resolve(value, theme) {
  const v = value.replace(/\s*\/\*.*?\*\/\s*/g, "");
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return resolve(theme[ref[1]], theme);
  return NAMED[v] || v;
}
function rgb(hex) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
}
function lum(hex) {
  const [r, g, b] = rgb(hex).map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const light = tokens(":root");
const dark = { ...light, ...tokens(':root[data-theme="dark"]') };

// [foreground, background, minimum ratio]
const PAIRS = [
  ["--text", "--bg", 7], ["--text", "--bg-panel", 7], ["--text", "--bg-cell", 7], ["--text", "--bg-input", 7], ["--text", "--bg-hover", 7],
  ["--text-dim", "--bg", 4.5], ["--text-dim", "--bg-panel", 4.5], ["--text-dim", "--bg-cell", 4.5],
  ["--text-lo", "--bg", 4.5], ["--text-lo", "--bg-panel", 4.5],
  ["--accent", "--bg", 4.5], ["--accent", "--accent-bg", 4.5], ["--accent", "--bg-panel", 4.5],
  ["--hot", "--bg", 4.5], ["--hot", "--hot-bg", 4.5], ["--hot", "--bg-panel", 4.5],
  ["--green", "--bg", 4.5], ["--green", "--green-bg", 4.5], ["--green", "--bg-panel", 4.5],
  ["--red", "--bg", 4.5], ["--red", "--red-bg", 4.5], ["--red", "--bg-panel", 4.5],
  ["--amber", "--bg", 4.5], ["--amber", "--amber-bg", 4.5],
  ["--purple", "--bg", 4.5],
  ["--bg", "--text", 7], // primary button: page background on the text colour
  ["--border-hi", "--bg", 3], // strong rules / control outlines
];

for (const [name, theme] of [["light", light], ["dark", dark]]) {
  test(`${name} theme: text and status colours meet their contrast targets`, () => {
    const failures = [];
    for (const [fg, bg, min] of PAIRS) {
      const ratio = contrast(resolve(theme[fg], theme), resolve(theme[bg], theme));
      if (ratio < min) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
    }
    assert.deepEqual(failures, []);
  });
}

test("the dark theme overrides every colour token the light theme defines", () => {
  const colourTokens = Object.keys(light).filter((k) => /^--(bg|border|text|accent|green|amber|red|purple|st-dead|overlay|shadow|btn-primary-hover)/.test(k) && !/^--(shift|reduce|goto)/.test(k));
  const overridden = tokens(':root[data-theme="dark"]');
  const missing = colourTokens.filter((k) => !(k in overridden));
  assert.deepEqual(missing, []);
});

test("no component stylesheet hard-codes a hex colour outside the token blocks", () => {
  for (const f of ["ui.css"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", "shared", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.deepEqual(src.match(/#[0-9a-fA-F]{3,8}\b/g) || [], [], f);
  }
});
