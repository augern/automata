const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");

const A = load("grammar.js", "ll1.js", "firstfollow.js", "ctg.js", "ffwitness.js");
const js = (x) => JSON.parse(JSON.stringify(x));

// Every node that is one rule application has the symbols of one of the grammar's rules as its kids.
function assertConforms(g, node, label) {
  if (!node.abstract) {
    const kids = node.kids.map((k) => (typeof k === "string" ? k : k.text !== undefined ? k.text : k.sym));
    const ok = g.rules.some((r) => r.lhs === node.sym && r.rhs.length === kids.length && r.rhs.every((s, i) => s === kids[i]));
    assert.ok(ok, `${label}: ${node.sym} → ${kids.join(" ")} is not a rule`);
  } else {
    const y = A.ffwShortest(g)[node.sym];
    const text = node.kids.map((k) => (typeof k === "string" ? k : k.text));
    assert.deepEqual(js(text), js(y || ["…"]), `${label}: ${node.sym} abstract`);
  }
  for (const k of node.kids) if (typeof k !== "string" && k.text === undefined) assertConforms(g, k, label);
}

function checkAll(g, label) {
  const rec = A.ffRecord(g);
  for (const nt of g.nonterminals) {
    if (rec.nullable.has(nt)) {
      const w = A.ffwNullable(g, rec, nt);
      assertConforms(g, w.tree, `${label} nullable ${nt}`);
      assert.equal(A.ctgLayout(w.tree).leaves.length, 0, `${label}: ${nt} nullable has no tokens`);
    } else assert.equal(A.ffwNullable(g, rec, nt), null);
    for (const t of rec.first[nt]) {
      const w = A.ffwFirst(g, rec, nt, t);
      const lay = A.ctgLayout(w.tree);
      assert.equal(w.tree.sym, nt);
      assert.equal(lay.leafById.t, 0, `${label}: FIRST(${nt}) ∋ ${t}: the token comes first`);
      assert.equal(lay.leaves[0].text, t);
      assertConforms(g, w.tree, `${label} FIRST(${nt}) ∋ ${t}`);
    }
    for (const t of rec.follow[nt]) {
      const w = A.ffwFollow(g, rec, nt, t);
      const lay = A.ctgLayout(w.tree, { endMarker: w.endMarker });
      const at = lay.leafById[t === "$" ? "end" : "t"];
      assert.ok(at !== undefined, `${label}: FOLLOW(${nt}) ∋ ${t}: has the token`);
      assert.equal(lay.leaves[at].text, t);
      assert.equal(A.ctgNextLeaf(lay, "target"), at, `${label}: FOLLOW(${nt}) ∋ ${t}: the token follows the symbol`);
      if (!w.unreachable) assert.equal(w.tree.sym, g.start, `${label}: rooted at the start symbol`);
      assertConforms(g, w.tree, `${label} FOLLOW(${nt}) ∋ ${t}`);
    }
    assert.equal(A.ffwFirst(g, rec, nt, "no-such-token"), null);
    assert.equal(A.ffwFollow(g, rec, nt, "no-such-token"), null);
  }
}

test("shortest strings: the shortest derivation of each nonterminal, null for an unproductive one", () => {
  const g = A.parseBNF("S -> A B\nA -> a A | b\nB -> c | B c\nU -> U u", false);
  const sh = A.ffwShortest(g);
  assert.deepEqual(js(sh.S), ["b", "c"]);
  assert.deepEqual(js(sh.A), ["b"]);
  assert.equal(sh.U, null);
});

test("witnesses conform to the grammar and show their token, for every set member of the examples", () => {
  const dir = path.join(__dirname, "..", "tools", "firstfollow");
  const lib = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "shared", "grammars.json"), "utf8"));
  const data = JSON.parse(fs.readFileSync(path.join(dir, "examples.json"), "utf8"));
  for (const grp of data.groups) for (const ex of grp.examples) {
    const text = (ex.grammar ? lib[ex.grammar].text : ex.text).join("\n");
    checkAll(A.parseBNF(text, false), ex.label);
  }
});

test("witnesses for random grammars", () => {
  let seed = 7;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) >> 8) % n;
  for (let k = 0; k < 400; k++) {
    const nts = ["S", "A", "B", "C"].slice(0, 2 + rnd(3));
    const syms = [...nts, "a", "b", "c"];
    const lines = nts.map((nt) => nt + " -> " + Array.from({ length: 1 + rnd(3) }, () => (rnd(4) === 0 ? "eps" : Array.from({ length: 1 + rnd(3) }, () => syms[rnd(syms.length)]).join(" "))).join(" | "));
    checkAll(A.parseBNF(lines.join("\n"), false), lines.join(" ; "));
  }
});

test("a witness of FOLLOW through a nullable symbol shows the symbol as a point and the token next to the string", () => {
  const g = A.parseBNF("S -> A N b\nA -> a\nN -> eps", false);
  const rec = A.ffRecord(g);
  const w = A.ffwFollow(g, rec, "A", "b");
  const lay = A.ctgLayout(w.tree);
  const n = lay.nodes.find((x) => x.sym === "N");
  assert.equal(n.point, true);
  assert.equal(A.ctgNextLeaf(lay, "target"), lay.leafById.t);
});
