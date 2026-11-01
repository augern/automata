const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

for (const dir of fs.readdirSync(path.join(__dirname, "../tools"))) {
  const file = path.join(__dirname, "../tools", dir, "guide.js");
  if (!fs.existsSync(file)) continue;
  test(`tools/${dir}/guide.js: parses and has the fields the pop-up reads`, () => {
    const window = {};
    new Function("window", fs.readFileSync(file, "utf8"))(window);
    const g = window.TOOL_GUIDE;
    assert.ok(g.title && g.intro && Array.isArray(g.use) && g.use.length && Array.isArray(g.notation) && Array.isArray(g.legend));
    for (const [name, text] of [...g.notation, ...g.legend]) assert.ok(name && text);
  });
}
