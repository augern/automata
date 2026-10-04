// Cache-busting stamps (see scripts/stamp.js): every shared/vendor reference in
// every local script/stylesheet reference carries ?v=<content hash>, and the hash is current. If this fails,
// run `npm run stamp` and commit the result.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { stamp, hashOf, pages, REF } = require("../scripts/stamp.js");

const root = path.join(__dirname, "..");

test("every local script and stylesheet reference is stamped with its file's current hash", () => {
  const stale = [];
  for (const page of pages) {
    const file = path.join(root, page);
    const html = fs.readFileSync(file, "utf8");
    if (stamp(html, path.dirname(file)) !== html) stale.push(page);
  }
  assert.deepEqual(stale, [], "stale stamps in these pages: run `npm run stamp`");
});

test("stamping is idempotent and replaces an old stamp", () => {
  const html = '<script src="../../shared/ui.js?v=deadbeef"></script><link rel="stylesheet" href="../../shared/ui.css">';
  const dir = path.join(root, "tools", "pda");
  const once = stamp(html, dir);
  assert.match(once, new RegExp(`ui\\.js\\?v=${hashOf(path.join(root, "shared/ui.js"))}"`));
  assert.match(once, new RegExp(`ui\\.css\\?v=${hashOf(path.join(root, "shared/ui.css"))}"`));
  assert.equal(stamp(once, dir), once);
});

test("only script and stylesheet references are stamped", () => {
  const html = '<a href="../../index.html">x</a><script>fetch("examples.json")</script><script src="../../shared/ui.js"></script>';
  const out = stamp(html, path.join(root, "tools", "pda"));
  assert.ok(out.includes('href="../../index.html"'));
  assert.ok(out.includes('fetch("examples.json")'));
  assert.equal([...out.matchAll(REF)].length, 1);
});

test("the hash changes when the file changes", () => {
  const tmp = path.join(require("node:os").tmpdir(), "stamp-test-" + process.pid + ".js");
  fs.writeFileSync(tmp, "a");
  const h1 = hashOf(tmp);
  fs.writeFileSync(tmp, "b");
  const h2 = hashOf(tmp);
  fs.unlinkSync(tmp);
  assert.notEqual(h1, h2);
  assert.match(h1, /^[0-9a-f]{8}$/);
});
