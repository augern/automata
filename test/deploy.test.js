// The site is static: every script/stylesheet/fetch the pages reference must
// exist in the repo, and the Pages job must copy the directories they live in.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pages = [["index.html"], ...fs.readdirSync(path.join(root, "tools")).filter((f) => f.endsWith(".html")).map((f) => ["tools", f])];

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

test("example files referenced from tool scripts exist", () => {
  for (const f of fs.readdirSync(path.join(root, "tools")).filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(root, "tools", f), "utf8");
    for (const m of html.matchAll(/"\.\.\/(examples\/[\w.-]+\.json)"|'\.\.\/(examples\/[\w.-]+\.json)'/g)) {
      assert.ok(fs.existsSync(path.join(root, m[1] || m[2])), `${f}: missing ${m[1] || m[2]}`);
    }
  }
});

test("the Pages job copies every directory the pages load from", () => {
  const ci = fs.readFileSync(path.join(root, ".gitlab-ci.yml"), "utf8");
  const dirs = new Set();
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, ...page), "utf8");
    for (const m of html.matchAll(/(?:src|href)="(?:\.\.\/)?(shared|vendor|examples)\//g)) dirs.add(m[1]);
  }
  dirs.add("examples");
  for (const d of dirs) assert.match(ci, new RegExp(`cp -r [^\\n]*\\b${d}\\b`), `.gitlab-ci.yml does not copy ${d}/`);
  assert.match(ci, /cp tools\/\*\.html/);
  assert.match(ci, /cp index\.html/);
});
