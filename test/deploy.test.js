// The site is static: every script/stylesheet/fetch the pages reference must
// exist in the repo, and the Pages job must copy the directories they live in.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const toolDirs = fs.readdirSync(path.join(root, "tools"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const pages = [["index.html"], ["ui-kit.html"], ...toolDirs.map((d) => ["tools", d, "index.html"])];

test("every local script and stylesheet referenced by a page exists", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, ...page), "utf8");
    const dir = path.dirname(path.join(root, ...page));
    for (const m of html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"#?]+)"/g)) {
      if (/^(https?:)?\/\//.test(m[1])) continue;
      assert.ok(fs.existsSync(path.resolve(dir, m[1])), `${page.join("/")}: missing ${m[1]}`);
    }
  }
});

test("no page loads anything from a CDN", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, ...page), "utf8");
    assert.equal(/<script[^>]*\ssrc="https?:/.test(html), false, `${page.join("/")} loads a remote script`);
  }
});

test("every tool has its own examples.json and guide.js, and loads them", () => {
  for (const d of toolDirs) {
    const html = fs.readFileSync(path.join(root, "tools", d, "index.html"), "utf8");
    for (const f of ["examples.json", "guide.js"]) {
      assert.ok(fs.existsSync(path.join(root, "tools", d, f)), `tools/${d}: missing ${f}`);
    }
    assert.match(html, /"examples\.json"|'examples\.json'/, `tools/${d}: does not load examples.json`);
    assert.match(html, /<script src="guide\.js/, `tools/${d}: does not load guide.js`);
  }
});

test("old tool addresses redirect to the new directories", () => {
  for (const d of toolDirs) {
    const stub = fs.readFileSync(path.join(root, "tools", `${d}-tool.html`), "utf8");
    assert.ok(stub.includes(`location.replace("${d}/"`), `${d}-tool.html does not redirect`);
  }
});

test("the Pages job copies every directory the pages load from", () => {
  const ci = fs.readFileSync(path.join(root, ".gitlab-ci.yml"), "utf8");
  const dirs = new Set(["tools"]);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, ...page), "utf8");
    for (const m of html.matchAll(/(?:src|href)="(?:\.\.\/)*(shared|vendor)\//g)) dirs.add(m[1]);
  }
  for (const d of dirs) assert.match(ci, new RegExp(`cp -r [^\\n]*\\b${d}\\b`), `.gitlab-ci.yml does not copy ${d}/`);
  assert.match(ci, /cp index\.html ui-kit\.html/);
});
