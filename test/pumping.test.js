const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const P = load("grammar.js", "rdp.js", "regex.js", "pumping.js");
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
// a*b*: tries to be a^n b^n and accepts far too much
const ASTAR_BSTAR = `start: s
accept: s t
s a s
s b t
t b t
t a dead
dead a,b dead`;
// (#a - #b) mod 3 over a*b*
const MOD3 = `start: A0
accept: A0 B0
A0 a A1
A1 a A2
A2 a A0
A0 b B2
A1 b B0
A2 b B1
B0 b B2
B1 b B0
B2 b B1
B0 a dead
B1 a dead
B2 a dead
dead a,b dead`;
const SQUARES_MOD5 = `start: r0
accept: r0 r1 r4
r0 a r1
r1 a r2
r2 a r3
r3 a r4
r4 a r0`;

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

test("refuting DFAs that claim a non-regular language", () => {
  for (const [name, text, target] of [
    ["a*b* for aⁿbⁿ", ASTAR_BSTAR, "anbn"],
    ["difference mod 3 for aⁿbⁿ", MOD3, "anbn"],
    ["squares mod 5 for aⁿ², n a square", SQUARES_MOD5, "squares"],
  ]) {
    const d = P.pumpParseDFA(text);
    const r = P.pumpRefuteDFA(d, target);
    assert.equal(r.kind, "pumped", name);
    assert.ok(r.w.length >= d.states.length);
    assert.equal(P.PUMP_TARGETS[target].member(r.w), true, "w is in the language");
    assert.equal(P.pumpDFARun(d, r.w).accepted, true, "and the DFA accepts it");
    assert.equal(r.parts.x + r.parts.y + r.parts.z, r.w);
    assert.equal(r.pumped, P.pumpJoin(r.parts, r.i));
    assert.equal(P.pumpDFARun(d, r.pumped).accepted, true, "the DFA accepts the pumped string");
    assert.equal(P.PUMP_TARGETS[target].member(r.pumped), false, "which is not in the language");
  }
});

test("a DFA that is right about a regular language is not refuted", () => {
  const d = P.pumpParseDFA("start: e\naccept: e\ne a o\no a e\ne b e\no b o");
  assert.equal(P.pumpRefuteDFA(d, "evena").kind, "none");
});

test("a DFA that rejects a member, or disagrees on a short string, is reported as such", () => {
  const rejectsAll = P.pumpParseDFA("start: q\nq a q");
  assert.equal(P.pumpRefuteDFA(rejectsAll, "anbn").kind, "misses");
  const wrongParity = P.pumpParseDFA("start: e\naccept: o\ne a o\no a e\ne b e\no b o");
  assert.notEqual(P.pumpRefuteDFA(wrongParity, "evena").kind, "none");
});

test("the languages to refute", () => {
  const T = P.PUMP_TARGETS;
  assert.equal(T.anbn.member("aabb"), true);
  assert.equal(T.anbn.member("abab"), false);
  assert.equal(T.anbncn.member("aabbcc"), true);
  assert.equal(T.anbncn.member("aabbc"), false);
  assert.equal(T.ww.member("abab"), true);
  assert.equal(T.ww.member("abba"), false);
  assert.equal(T.squares.member("aaaa"), true);
  assert.equal(T.squares.member("aaa"), false);
  assert.equal(T.primes.member("aaaaa"), true);
  assert.equal(T.primes.member("aaaa"), false);
  for (const key of Object.keys(T)) for (let n = 1; n <= 6; n++) for (const w of T[key].samples(n)) assert.equal(T[key].member(w), true, `${key} sample ${w}`);
});

// ── Parse trees ───────────────────────────────────────────────────────
const gram = (src) => P.rdpParseGrammar(src);
const treeOf = (g, w) => P.pumpParseTree(g, [...w]).tree;

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

test("refuting grammars that claim a language beyond context-free power", () => {
  for (const [name, src, target] of [
    ["aⁿbⁿ c* for aⁿbⁿcⁿ", "S -> X C\nX -> a X b | eps\nC -> c C | eps", "anbncn"],
    ["aⁿ b* cⁿ for aⁿbⁿcⁿ", "S -> a S c | B\nB -> b B | eps", "anbncn"],
    ["palindromes for ww", "S -> a S a | b S b | eps", "ww"],
  ]) {
    const g = gram(src);
    const r = P.pumpRefuteGrammar(g, target);
    assert.equal(r.kind, "pumped", name);
    assert.equal(P.PUMP_TARGETS[target].member(r.w), true, name + ": w is in the language");
    assert.equal(P.PUMP_TARGETS[target].member(r.pumped), false, name + ": the pumped string is not");
    assert.equal(P.pumpParseTree(g, [...r.pumped]).tree !== null, true, name + ": but the grammar generates it");
  }
});

test("grammars: reports a language the grammar misses, and what it cannot handle", () => {
  assert.equal(P.pumpRefuteGrammar(gram("S -> a"), "anbn").kind, "misses");
  assert.equal(P.pumpRefuteGrammar(gram("E -> E + a | a"), "anbn").kind, "unsupported");
  assert.equal(P.pumpRefuteGrammar(gram("S -> id"), "anbn").kind, "unsupported");
});

test("grammars that over-generate in a way the trees of members do not show are caught by a short string", () => {
  const g = gram("S -> a S b | a S | eps");
  const r = P.pumpRefuteGrammar(g, "anbn");
  assert.equal(r.kind, "differs");
  assert.equal(P.PUMP_TARGETS.anbn.member(r.w), false);
  assert.equal(P.pumpParseTree(g, [...r.w]).tree !== null, true);
});
