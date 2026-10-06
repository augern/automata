// Dead-CSS guard: every rule in the shared stylesheets and in each tool's own
// <style> must have at least one class/id that some markup or script uses.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const list = (dir, ext) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
// Each tool is a directory: tools/<name>/index.html
const toolPages = () => fs.readdirSync(path.join(root, "tools"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join("tools", d.name, "index.html"));

const stripComments = (c) => c.replace(/\/\*[\s\S]*?\*\//g, "");
const stripStyle = (h) => h.replace(/<style>[\s\S]*?<\/style>/g, "");

// Everything that can mention a class or id: page markup (without <style>) and all scripts.
const pages = ["index.html", "ui-kit.html", ...toolPages()];
const scripts = [...list("shared", ".js"), ...list("shared/algo", ".js")];
const markupAndScripts = pages.map((p) => stripStyle(read(p))).concat(scripts.map((s) => read(s))).join("\n");

// Class names assembled at runtime ("is-" + kind), so a plain text search can't see them.
const DYNAMIC = new Set([
  "is-start", "is-accept", "is-reject", "is-both", // UI.table.state / refreshStates
  "ui-th--accept", "ui-th--reject", // UI.table.th tone
  "ui-cell--narrow", "ui-cell--wide", // UI.table.input size
  "ui-explain__role--initial", "ui-explain__role--live", "ui-explain__role--accepted", "ui-explain__role--rejected", "ui-explain__role--dead", "ui-explain__role--expanded", // role names built in the PDA tool
  "ag-arrowhead--eps", "ag-arrowhead--hot", // arrow marker kinds built in ensureArrowMarkers
  "pump-x", "pump-y", "pump-z", "pt-u", "pt-v", "pt-x", "pt-y", "pt-z", "pt-up", "pt-low", "pt-both", // pumped string parts and tree marks, built in the pumping tool
  "gh-lhs", "gh-rhs", "gh-sym", "gh-hot", "gh-done", "gh-gone", "k-tok", "st-open", "st-ok", "st-fail", // search-tree node kind/status and grammar-highlight roles, built in the RDP tool
]);

const TOKEN = /[.#]([A-Za-z_][\w-]*)/g;
function deadRules(css, corpus) {
  const dead = [];
  for (const m of stripComments(css).matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selector = m[1].replace(/\s+/g, " ").trim();
    if (/^(from|to|\d+%)/.test(selector) || /^(html|body|\*)/.test(selector)) continue;
    const alive = selector.split(",").some((part) => {
      const tokens = [...part.replace(/\[[^\]]*\]|::?[\w-]+(\([^)]*\))?/g, "").matchAll(TOKEN)].map((t) => t[1]);
      return tokens.every((t) => DYNAMIC.has(t) || corpus.includes(t));
    });
    if (!alive) dead.push(selector);
  }
  return dead;
}

for (const sheet of ["shared/shared.css", "shared/ui.css"]) {
  test(`${sheet} has no unused rules`, () => {
    assert.deepEqual(deadRules(read(sheet), markupAndScripts), []);
  });
}

for (const tool of toolPages()) {
  test(`${path.basename(path.dirname(tool))} has no unused rules in its own <style>`, () => {
    const html = read(tool);
    const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
    // A tool's own CSS counts as used only if its own markup, or a script, mentions it.
    const corpus = stripStyle(html) + "\n" + scripts.map((s) => read(s)).join("\n");
    assert.deepEqual(deadRules(css, corpus), []);
  });
}

test("a tool does not re-declare a shared rule with identical declarations", () => {
  const props = (body) => body.split(";").map((p) => p.trim()).filter(Boolean).map((p) => p.replace(/\s*:\s*/, ":")).sort().join(";");
  const parse = (css) => {
    const out = new Map();
    for (const m of stripComments(css).matchAll(/([^{}@]+)\{([^{}]*)\}/g)) out.set(m[1].replace(/\s+/g, " ").trim(), props(m[2]));
    return out;
  };
  const shared = new Map([...parse(read("shared/shared.css")), ...parse(read("shared/ui.css"))]);
  const dupes = [];
  for (const tool of toolPages()) {
    const css = (read(tool).match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
    for (const [sel, p] of parse(css)) if (shared.has(sel) && shared.get(sel) === p) dupes.push(`${path.basename(path.dirname(tool))}: ${sel}`);
  }
  assert.deepEqual(dupes, []);
});
