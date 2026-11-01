const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const P = load("grammar.js", "strings.js", "rdp.js", "regex.js", "pumping.js", "ctg.js");
const fs = require("node:fs");
const path = require("node:path");
const arr = (x) => [...x];

// ── DFA ───────────────────────────────────────────────────────────────
const ENDS_ABB = `start: q0
accept: q3
q0 a q1
q0 b q0
q1 a q1
q1 b q2
q2 a q1
q2 b q3
q3 a q1
q3 b q0`;
const gram = (src) => P.rdpParseGrammar(src);
const treeOf = (g, w) => P.pumpParseTree(g, [...w]).tree;

test("DFA text: parse, run and print back", () => {
  const d = P.pumpParseDFA(ENDS_ABB);
  assert.equal(d.states.length, 4);
  assert.deepEqual(arr(d.alpha), ["a", "b"]);
  assert.equal(P.pumpDFARun(d, "aabb").accepted, true);
  assert.equal(P.pumpDFARun(d, "abba").accepted, false);
  const again = P.pumpParseDFA(P.pumpDFAToText(d));
  for (const w of ["abb", "babb", "ab", "", "abbb"]) assert.equal(P.pumpDFARun(again, w).accepted, P.pumpDFARun(d, w).accepted, w);
});

test("DFA text: errors", () => {
  assert.throws(() => P.pumpParseDFA("q0 a"), /Expected/);
  assert.throws(() => P.pumpParseDFA("q0 a q1\nq0 a q2"), /not a DFA/);
  assert.throws(() => P.pumpParseDFA("q0 ab q1"), /single character/);
  assert.throws(() => P.pumpParseDFA("// nothing"), /No states/);
});

test("a missing transition stops the run", () => {
  const d = P.pumpParseDFA("q0 a q1");
  const r = P.pumpDFARun(d, "aa");
  assert.equal(r.accepted, false);
  assert.equal(r.stuckAt, 1);
});

test("DFA from a minimised regex", () => {
  const nfa = P.regexToNFA("(a|b)*abb");
  const min = P.minimizeDFA(P.subsetConstruct(nfa));
  const d = P.pumpDFAFromMin(min);
  assert.equal(P.pumpDFARun(d, "babb").accepted, true);
  assert.equal(P.pumpDFARun(d, "bab").accepted, false);
});

test("pigeonhole: a string at least as long as the number of states has a repeat within the first states + 1 positions", () => {
  const d = P.pumpParseDFA(ENDS_ABB);
  for (const w of ["abab", "bbbb", "aaaa", "abbb", "babba"]) {
    const run = P.pumpDFARun(d, w);
    const loop = P.pumpFindLoop(run.path);
    assert.ok(loop, w);
    assert.ok(loop.t <= d.states.length, `|xy| = ${loop.t} > ${d.states.length}`);
    const parts = P.pumpSplit(w, loop);
    assert.equal(parts.x + parts.y + parts.z, w);
    assert.ok(parts.y.length >= 1);
    // pumping never changes the verdict: the pumped string ends in the same state
    for (let i = 0; i <= 5; i++) assert.equal(P.pumpDFARun(d, P.pumpJoin(parts, i)).accepted, run.accepted, `${w} i=${i}`);
  }
  assert.equal(P.pumpFindLoop(P.pumpDFARun(d, "ab").path), null);
});

test("parse tree of a string, and its yield", () => {
  const g = gram("S -> a S b | eps");
  const t = treeOf(g, "aabb");
  assert.deepEqual(arr(P.pumpYield(t)), ["a", "a", "b", "b"]);
  assert.equal(t.sym, "S");
  assert.equal(P.pumpHeight(t), 3);
  assert.equal(treeOf(g, "aab"), null);
});

test("pairs: the lowest repeat on the longest path, with v y not empty", () => {
  const g = gram("S -> a S b | eps");
  const t = treeOf(g, "aabb");
  const pairs = P.pumpPairs(t);
  assert.ok(pairs.length > 0);
  for (const p of pairs) {
    const parts = P.pumpDecompose(t, p);
    assert.equal(parts.u.concat(parts.v, parts.x, parts.y, parts.z).join(""), "aabb");
    assert.ok(parts.v.length + parts.y.length >= 1);
  }
  const best = P.pumpDecompose(t, pairs[0]);
  assert.deepEqual([best.v.join(""), best.x.join(""), best.y.join("")], ["a", "", "b"]);
});

test("pumping a tree gives trees of the grammar, with yield u vⁱ x yⁱ z", () => {
  const g = gram("S -> a S b | eps");
  const t = treeOf(g, "aabb");
  const pair = P.pumpPairs(t)[0];
  const parts = P.pumpDecompose(t, pair);
  for (let i = 0; i <= 4; i++) {
    const pumped = P.pumpTree(t, pair, i);
    const expect = [...parts.u, ...Array(i).fill(parts.v).flat(), ...parts.x, ...Array(i).fill(parts.y).flat(), ...parts.z].join("");
    assert.equal(P.pumpYield(pumped).join(""), expect, "i=" + i);
    // it really is a derivable string
    assert.equal(P.pumpParseTree(g, [...expect]).tree !== null, true, expect);
  }
  assert.equal(JSON.stringify(P.pumpTree(t, pair, 1)), JSON.stringify(t));
});

test("tags give every leaf its part", () => {
  const g = gram("S -> a S b | eps");
  const t = treeOf(g, "aabb");
  const pair = P.pumpPairs(t)[0];
  const tagged = P.pumpTag(t, pair);
  const parts = P.pumpLeaves(tagged).map((l) => l.part).join("");
  assert.equal(parts, "uvyz");
  assert.equal(JSON.stringify(P.pumpYield(tagged)), JSON.stringify(P.pumpYield(t)));
});

test("v and y when the repeat spans an intermediate nonterminal", () => {
  const g = gram("S -> a A d | eps\nA -> b S c");
  const t = treeOf(g, "ababcdcd");
  const pair = P.pumpPairs(t).find((p) => p.up.length === 0 && p.low.length === 2);
  const parts = P.pumpDecompose(t, pair);
  assert.deepEqual([parts.u, parts.v, parts.x, parts.y, parts.z].map((a) => a.join("")), ["", "ab", "abcd", "cd", ""]);
});

test("pumpGeneralCF: the letters of the lemma, in the figure's input form", () => {
  const g = P.pumpGeneralCF(2);
  assert.deepEqual(JSON.parse(JSON.stringify([g.root, g.up, g.i, g.rootIsUp, Object.keys(g.parts).join("")])), ["S", "A", 2, false, "uvxyz"]);
});

test("empty parts are ε in the path figure, in the part they belong to", () => {
  const g = P.rdpParseGrammar("S -> a A d | eps\nA -> b S c");
  const tree = P.pumpParseTree(g, P.rdpTokenise(g, "abcd")).tree;
  const pair = P.pumpPairs(tree)[0]; // the root S and the S below A: u, x and z are empty
  const tagged = P.pumpTag(tree, pair);
  const f = P.pumpSplitFigure("S", "S", P.pumpDecompose(tree, pair), "", 1, pair.up.length === 0, { top: pair.up.length, mid: pair.low.length - pair.up.length });
  assert.deepEqual(JSON.parse(JSON.stringify([f.parts.u.text, f.parts.x.text, f.parts.z.text, f.rootIsUp])), ["ε", "ε", "ε", true]);
});

test("pumpSplitFigure: the parts of the original string, ε for an empty one", () => {
  const f = P.pumpSplitFigure("S", "A", { u: [], v: ["a", "b"], x: [], y: ["c"], z: [] }, "", 2, false);
  assert.deepEqual(JSON.parse(JSON.stringify([f.parts.u.text, f.parts.v.text, f.parts.x.text, f.parts.y.text, f.i])), ["ε", "ab", "ε", "c", 2]);
});

// The figure for every pair of random sentences of several grammars, at every number of copies.
test("figures: the unified string is the pumped yield, and the layouts keep their invariants", () => {
  const root = path.join(__dirname, "..");
  const lib = JSON.parse(fs.readFileSync(path.join(root, "shared", "grammars.json"), "utf8"));
  const data = JSON.parse(fs.readFileSync(path.join(root, "tools", "pumping", "examples.json"), "utf8"));
  const grammars = [];
  for (const grp of data.groups) for (const ex of grp.examples) if (ex.mode === "cf") grammars.push([ex.label, ex.grammar ? lib[ex.grammar].text.join("\n") : ex.text.join("\n")]);
  for (const key of ["java-statements-expressions-ll", "python-statements-expressions-ll"]) grammars.push([key, lib[key].text.join("\n")]);
  let seed = 11;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let figures = 0;
  for (const [label, text] of grammars) {
    const g = P.rdpParseGrammar(text);
    if (P.rdpLeftRecursive(g).length) continue;
    const sep = [...g.terminals].some((t) => [...t].length > 1) ? " " : "";
    for (let n = 0; n < 12; n++) {
      const sentence = P.grammarRandomSentence(g.base, rng, { minTerms: 6, maxTerms: 18 });
      if (!sentence) continue;
      const parsed = P.pumpParseTree(g, sentence);
      if (!parsed.tree) continue;
      const pairs = P.pumpPairs(parsed.tree);
      for (const pair of pairs.slice(0, 2)) {
        const parts = P.pumpDecompose(parsed.tree, pair);
        const tagged = P.pumpTag(parsed.tree, pair);
        const hops = { top: pair.up.length, mid: pair.low.length - pair.up.length };
        for (let i = 0; i <= 4; i++) {
          const yieldText = P.pumpYield(P.pumpTree(tagged, pair, i)).join(sep);
          const fig = P.pumpSplitFigure(parsed.tree.sym, P.pumpGet(parsed.tree, pair.up).sym, parts, sep, i, pair.up.length === 0, hops);
          const split = P.ctgSplitLayout(fig), uni = P.ctgSplitLayout(fig, { unify: true });
          const where = `${label}: "${sentence.join(sep)}", ${i} copies`;
          figures++;
          // the unified figure reads as the pumped string
          assert.equal(uni.tokens.filter((t) => !t.eps).map((t) => t.text).join(sep), yieldText, where);
          for (let k = 1; k < uni.tokens.length; k++) assert.ok(uni.tokens[k].x >= uni.tokens[k - 1].x + uni.tokens[k - 1].w - 1e-6, `${where}: tokens overlap`);
          // the apexes do not move between the modes; the nodes lie one step apart down the spine
          const placed = (lay) => JSON.parse(JSON.stringify(lay.nodes.map((n) => [n.sym, Math.round(n.x * 1e6) / 1e6, Math.round(n.y * 1e6) / 1e6, n.cls])));
          assert.deepEqual(placed(uni), placed(split), where);
          for (let k = 1; k < uni.nodes.length; k++) assert.ok(uni.nodes[k].y > uni.nodes[k - 1].y, `${where}: nodes in order`);
          // triangles nest: strictly inside the one before
          for (const lay of [split, uni]) {
            const tris = lay.tris.filter((t) => !t.blank);
            const slope = (t) => (t.x1 - t.x0) / 2 / (t.y - t.ay);
            tris.forEach((t, k) => {
              assert.ok(Math.abs(slope(t) - slope(tris[0])) < 1e-9, `${where}: one angle`);
              if (k && lay === uni) assert.ok(t.x0 > tris[k - 1].x0 && t.x1 < tris[k - 1].x1, `${where}: nested`);
            });
            assert.ok(lay.width > 0 && Number.isFinite(lay.height), where);
          }
        }
      }
    }
  }
  assert.ok(figures > 300, "enough figures were checked: " + figures);
});

test("pumpLengthCF: b^(|V|+1) with b the longest right-hand side, at least 2", () => {
  assert.equal(P.pumpLengthCF(P.rdpParseGrammar("S -> a S b | eps")), 9);
  assert.equal(P.pumpLengthCF(P.rdpParseGrammar("E -> T + E | T\nT -> F * T | F\nF -> ( E ) | a")), 81);
  assert.equal(P.pumpLengthCF(P.rdpParseGrammar("S -> a")), 4, "b is at least 2");
});

test("pumpSplitFigure and pumpGeneralCF: the line down to x is jagged unless the lowest node is one rule step", () => {
  const parts = { u: [], v: ["a"], x: [], y: ["b"], z: [] };
  assert.equal(P.pumpSplitFigure("S", "S", parts, "", 1, false, { top: 1, mid: 1 }).lowJag, true, "by default");
  assert.equal(P.pumpSplitFigure("S", "S", parts, "", 1, false, { top: 1, mid: 1 }, false).lowJag, false);
  assert.equal(P.pumpGeneralCF(1).lowJag, true, "A derives x in any number of steps");
  // a leaf-only subtree is one rule step
  const tree = P.pumpParseTree(P.rdpParseGrammar("S -> a S b | eps"), ["a", "b"]).tree;
  const low = P.pumpGet(tree, P.pumpPairs(tree)[0].low);
  assert.ok(low.children.every((c) => c.leaf), "S → ε is a single step");
});
