#!/usr/bin/env node
// Cache-busting for a build-less static site.
//
// Every <script src> and <link href> that points into shared/ or vendor/ gets
// "?v=<hash of that file's contents>", so a browser never runs a new page with a
// stale cached copy of a script (or the other way round). Run `npm run stamp`
// after editing anything under shared/ or vendor/; test/stamps.test.js fails
// until you do. With --check it only reports.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const pages = ["index.html", "ui-kit.html", ...fs.readdirSync(path.join(root, "tools")).filter((f) => f.endsWith(".html")).map((f) => "tools/" + f)];

function hashOf(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
}

// <script src="…"> and <link … href="…"> into shared/ or vendor/
const REF = /((?:<script[^>]*\ssrc|<link[^>]*\shref)=")((?:\.\.\/)?(?:shared|vendor)\/[^"?#]+)(?:\?v=[0-9a-f]+)?(")/g;

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
