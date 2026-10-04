// The browser loads shared/algo/*.js and each tool's inline script as classic
// scripts in one global scope, so a duplicate top-level name is either a
// SyntaxError (let/const) or a silent override (function).
//
// shared.js deliberately provides overridable defaults (loadExample, renderTree,
// ...) that tools replace with function declarations, so function-over-function
// is allowed there. Everything else is a bug: any clash with shared/algo/, and
// any let/const/var clash with shared.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const DECL = /^( *)(function|const|let|var)\s+(\w+)/gm;

// [{ name, kind }] for declarations indented at most maxIndent spaces.
function topLevel(src, maxIndent) {
  const out = [];
  for (const m of src.matchAll(DECL)) if (m[1].length <= maxIndent) out.push({ name: m[3], kind: m[2] });
  return out;
}
const topLevelNames = (src, maxIndent) => topLevel(src, maxIndent).map((d) => d.name);

const algoFiles = fs.readdirSync(path.join(root, "shared", "algo")).filter((f) => f.endsWith(".js"));
const toolFiles = fs.readdirSync(path.join(root, "tools")).filter((f) => f.endsWith(".html"));

test("shared/algo files and shared.js declare no duplicate top-level names", () => {
  const seen = new Map();
  for (const f of [...algoFiles.map((f) => ["shared", "algo", f]), ["shared", "shared.js"]]) {
    for (const name of topLevelNames(read(...f), 0)) {
      assert.ok(!seen.has(name), `${name} declared in both ${seen.get(name)} and ${f.join("/")}`);
      seen.set(name, f.join("/"));
    }
  }
});

for (const tool of toolFiles) {
  test(`${tool} does not clash with shared scripts`, () => {
    const src = read("tools", tool);
    const loaded = [...src.matchAll(/<script src="\.\.\/shared\/([\w/.]+\.js)(?:\?[^"]*)?"/g)].map((m) => m[1]);
    // name -> { file, kind } for everything this tool loads
    const shared = new Map();
    for (const f of loaded) for (const d of topLevel(read("shared", f), 0)) shared.set(d.name, { file: f, kind: d.kind });
    // Inline scripts are indented 6 spaces (0 in grammar-rewrite-tool).
    const inline = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    const clashes = [];
    for (const { name, kind } of topLevel(inline, 6)) {
      const other = shared.get(name);
      if (!other) continue;
      const overridable = other.file === "shared.js" && kind === "function" && other.kind === "function";
      if (!overridable) clashes.push(`${kind} ${name} (also ${other.kind} in ${other.file})`);
    }
    assert.deepEqual(clashes, []);
  });
}
