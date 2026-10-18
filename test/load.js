// Loads the browser-style scripts in shared/algo/ into one vm context so they
// can be tested without modification (they are classic scripts, not modules).
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

// load("grammar.js", "lr.js") -> { parseBNF, computeFirst, ... }
// Top-level `const`s are not properties of the context, so exports are
// collected by evaluating an object literal inside the context.
function load(...files) {
  const ctx = vm.createContext({ TextEncoder });
  for (const f of files) {
    const file = path.join(root, "shared", "algo", f);
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  }
  const names = files.flatMap((f) =>
    [...fs.readFileSync(path.join(root, "shared", "algo", f), "utf8")
      .matchAll(/^(?:function\s+(\w+)|const\s+(\w+)\s*=)/gm)].map((m) => m[1] || m[2])
  );
  return vm.runInContext("({" + names.join(",") + "})", ctx);
}

module.exports = { load };
