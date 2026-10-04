#!/usr/bin/env node
// Cache-busting for a build-less static site.
//
// Every local <script src> and <link href> (shared/, vendor/, or a file beside the page,
// like a tool's guide.js) gets "?v=<hash of that file's contents>", so a browser never
// runs a new page with a stale cached copy of a script (or the other way round). Run
// `npm run stamp` after editing any of those files; test/stamps.test.js fails until you do.
// With --check it only reports.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const toolDirs = fs.readdirSync(path.join(root, "tools"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const pages = ["index.html", "ui-kit.html", ...toolDirs.map((d) => `tools/${d}/index.html`)];

function hashOf(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
}

// <script src="…"> and <link … href="…"> to a local .js or .css file
const REF = /((?:<script[^>]*\ssrc|<link[^>]*\shref)=")((?!https?:|\/\/)[^"?#]+\.(?:js|css))(?:\?v=[0-9a-f]+)?(")/g;

function stamp(html, dir) {
  return html.replace(REF, (m, pre, ref, post) => {
    const file = path.resolve(dir, ref);
    return pre + ref + "?v=" + hashOf(file) + post;
  });
}

if (require.main === module) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const page of pages) {
    const file = path.join(root, page);
    const html = fs.readFileSync(file, "utf8");
    const next = stamp(html, path.dirname(file));
    if (next !== html) {
      stale++;
      if (!check) fs.writeFileSync(file, next);
    }
  }
  console.log(check ? `${stale} page(s) out of date` : `stamped ${stale} page(s)`);
  process.exit(check && stale ? 1 : 0);
}

module.exports = { stamp, hashOf, pages, REF };
