const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const P = load("grammar.js", "strings.js", "rdp.js", "regex.js", "pumping.js");
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

test("pumpCTG: triangles for the marked paths, the five parts as tokens, repeated copies of the middle part", () => {
  const g = P.rdpParseGrammar("S -> a S b | eps");
  const tree = P.pumpParseTree(g, P.rdpTokenise(g, "aabb")).tree;
  const pair = P.pumpPairs(tree)[0];
  const tagged = P.pumpTag(tree, pair);
  const count = (i) => { const r = P.pumpCTG(P.pumpTree(tagged, pair, i)); let n = 0; (function w(x) { n++; for (const k of x.kids) if (k.sym !== undefined) w(k); })(r.tree); return { n, parts: arr(r.parts).join("") }; };
  assert.equal(count(1).n, 3); // the root and the two chosen S
  assert.equal(count(3).n, 5);
  assert.equal(count(0).n, 2);
  assert.equal(count(2).parts.split("v").length - 1, 2); // v once per copy
});

test("pumpSpine: the spine of marked nodes, the strings beside each stretch, repeated per copy of the middle part", () => {
  const g = P.rdpParseGrammar("S -> a S b | eps");
  const tree = P.pumpParseTree(g, P.rdpTokenise(g, "aabb")).tree;
  const pair = P.pumpPairs(tree)[0];
  const tagged = P.pumpTag(tree, pair);
  const sp = (i) => P.pumpSpine(P.pumpTree(tagged, pair, i));
  const one = sp(1);
  assert.equal(one.nodes.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(one.segments.map((s) => [s.left && s.left.text, s.left && s.left.part, s.right && s.right.text, s.right && s.right.part]))), [["a", "u", "b", "z"], ["a", "v", "b", "y"]]);
  assert.equal(one.bottom.text, "ε"); // an empty string is drawn as ε
  assert.equal(sp(3).nodes.length, 5);
  assert.equal(sp(0).nodes.length, 2);
});

test("pumpSpine: the right-hand string of a stretch with several nodes is in the order of the yield", () => {
  const g = P.rdpParseGrammar("S -> a A d | eps\nA -> b S c");
  const tree = P.pumpParseTree(g, P.rdpTokenise(g, "abcd")).tree;
  const pair = P.pumpPairs(tree)[0];
  const sp = P.pumpSpine(P.pumpTree(P.pumpTag(tree, pair), pair, 2));
  assert.equal(sp.segments[1].right.text, "cd");
  assert.equal(sp.segments[1].left.text, "ab");
});

test("pumpGeneralCF: i copies of the middle part between the first A and the lowest one", () => {
  const sizes = (i) => { const g = P.pumpGeneralCF(i); let n = 0; (function w(x) { n++; for (const k of x.kids) if (k.sym !== undefined) w(k); })(g.tree); return [g.spine.nodes.length, g.spine.segments.length, n]; };
  assert.deepEqual(sizes(0), [2, 1, 2]);
  assert.deepEqual(sizes(1), [3, 2, 3]);
  assert.deepEqual(sizes(3), [5, 4, 5]);
  const parts = P.pumpGeneralCF(2).spine.segments.map((s) => s.left.part + s.right.part);
  assert.deepEqual(JSON.parse(JSON.stringify(parts)), ["uz", "vy", "vy"]);
});

test("empty parts are ε in the triangles and the path figures, in the part they belong to", () => {
  const g = P.rdpParseGrammar("S -> a A d | eps\nA -> b S c");
  const tree = P.pumpParseTree(g, P.rdpTokenise(g, "abcd")).tree;
  const pair = P.pumpPairs(tree)[0]; // the root S and the S below A: u, x and z are empty
  const tagged = P.pumpTag(tree, pair);
  const ctg = P.pumpCTG(P.pumpTree(tagged, pair, 1));
  assert.deepEqual(JSON.parse(JSON.stringify(ctg.parts)), ["v", "v", "x", "y", "y"]); // the root is the repeated node, the empty x is ε
  const sp = P.pumpSpine(P.pumpTree(tagged, pair, 1));
  assert.equal(sp.bottom.text, "ε");
  assert.equal(sp.bottom.part, "x");
  const tree2 = P.pumpParseTree(P.rdpParseGrammar("S -> a S b | eps"), ["a", "b"]).tree;
  const pair2 = P.pumpPairs(tree2)[0];
  const sp2 = P.pumpSpine(P.pumpTree(P.pumpTag(tree2, pair2), pair2, 1));
  assert.deepEqual(JSON.parse(JSON.stringify([sp2.segments[0].left.text, sp2.segments[0].left.part, sp2.bottom.text])), ["a", "v", "ε"]);
});

test("pumpSplitFigure: the parts of the original string, ε for an empty one", () => {
  const f = P.pumpSplitFigure("S", "A", { u: [], v: ["a", "b"], x: [], y: ["c"], z: [] }, "", 2, false);
  assert.deepEqual(JSON.parse(JSON.stringify([f.parts.u.text, f.parts.v.text, f.parts.x.text, f.parts.y.text, f.i])), ["ε", "ab", "ε", "c", 2]);
});
