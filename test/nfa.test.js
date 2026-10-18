const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { nfaEpsClosure, nfaBuildSimTree, nfaAcceptsString } = load("nfa.js");

// Build an NFA from "from,sym,to" triples ("ε" for epsilon moves).
function nfa(states, start, accepts, edges) {
  const trans = {};
  for (const s of states) trans[s] = {};
  for (const [from, sym, to] of edges) (trans[from][sym] ||= []).push(to);
  return { states, start: states.indexOf(start), accepts: new Set(accepts.map((a) => states.indexOf(a))), trans };
}

// (a|b)*abb — Aho et al. Fig. 3.34, built with Thompson's construction (states 0..10).
const ABB = nfa(
  ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  "0",
  ["10"],
  [
    ["0", "ε", "1"], ["0", "ε", "7"],
    ["1", "ε", "2"], ["1", "ε", "4"],
    ["2", "a", "3"], ["4", "b", "5"],
    ["3", "ε", "6"], ["5", "ε", "6"],
    ["6", "ε", "1"], ["6", "ε", "7"],
    ["7", "a", "8"], ["8", "b", "9"], ["9", "b", "10"],
  ]
);

const accepts = (n, input) => nfaBuildSimTree(n, input).accepted;
const sorted = (set) => [...set].sort((x, y) => Number(x) - Number(y));

test("ε-closure of the start state of (a|b)*abb is {0,1,2,4,7}", () => {
  assert.deepEqual(sorted(nfaEpsClosure(ABB, ["0"])), ["0", "1", "2", "4", "7"]);
});

test("ε-closure follows chains and handles cycles", () => {
  const n = nfa(["p", "q", "r"], "p", [], [["p", "ε", "q"], ["q", "ε", "r"], ["r", "ε", "p"]]);
  assert.deepEqual(sorted(nfaEpsClosure(n, ["q"])).sort(), ["p", "q", "r"]);
});

test("(a|b)*abb accepts exactly the strings ending in abb", () => {
  for (const w of ["abb", "aabb", "babb", "ababb", "bbabb"]) assert.ok(accepts(ABB, w), w);
  for (const w of ["", "a", "ab", "abba", "bb", "abab"]) assert.equal(accepts(ABB, w), false, w);
});

test("empty input is accepted when an accepting state is in the start's ε-closure", () => {
  const n = nfa(["s", "f"], "s", ["f"], [["s", "ε", "f"]]);
  assert.ok(accepts(n, ""));
  assert.equal(accepts(nfa(["s", "f"], "s", ["f"], []), ""), false);
});

test("nondeterminism: both branches appear in the tree", () => {
  const n = nfa(["s", "x", "y"], "s", ["y"], [["s", "a", "x"], ["s", "a", "y"]]);
  const t = nfaBuildSimTree(n, "a");
  const root = t.vRoot.children[0];
  assert.deepEqual(Array.from(root.children, (c) => c.state).sort(), ["x", "y"]);
  assert.ok(t.accepted);
  assert.equal(root.children.find((c) => c.state === "x").rejected, true);
});

test("dead branches are marked and a symbol with no transition rejects", () => {
  const t = nfaBuildSimTree(ABB, "c");
  assert.equal(t.accepted, false);
  assert.equal(t.vRoot.children[0].dead, true);
});

test("ε-hop annotations count moves before and after the symbol", () => {
  const n = nfa(["p", "q", "r", "t"], "p", ["t"], [["p", "ε", "q"], ["q", "a", "r"], ["r", "ε", "t"]]);
  const child = nfaBuildSimTree(n, "a").vRoot.children[0].children.find((c) => c.state === "t");
  assert.equal(child.epsCountBefore, 1);
  assert.equal(child.epsCountAfter, 1);
  assert.equal(child.viaEps, true);
});

test("verdict stays correct when the tree is truncated", () => {
  // The tree for "ababb" exceeds 512 nodes; the verdict must not depend on it.
  const t = nfaBuildSimTree(ABB, "ababb");
  assert.equal(t.truncated, true);
  assert.equal(t.accepted, true);
  assert.equal(nfaAcceptsString(ABB, "ababb"), true);
  assert.equal(nfaAcceptsString(ABB, "ababba"), false);
});

test("tree growth is capped and reported", () => {
  // Every a doubles the branches: s -a-> s and s -a-> s via a second path.
  const n = nfa(["s", "u"], "s", [], [["s", "a", "s"], ["s", "a", "u"], ["u", "a", "s"]]);
  const t = nfaBuildSimTree(n, "a".repeat(30), 64);
  assert.equal(t.truncated, true);
});

// ── nfaExplainConfig ──────────────────────────────────────────────────
(function () {
  const { nfaExplainConfig } = load("nfa.js");
  // q0 -ε-> q1, q1 -a-> q2 (accepting), q0 -b-> q0
  const nfa = { states: ["q0", "q1", "q2"], start: 0, accepts: new Set([2]),
    trans: { q0: { ε: ["q1"], b: ["q0"] }, q1: { a: ["q2"] }, q2: {} } };
  const walk = (n, out = []) => { out.push(n); n.children.forEach((c) => walk(c, out)); return out; };

  test("nfaExplainConfig: arrival names the ε-hop and the transition actually used", () => {
    const chars = [..."a"];
    const t = nfaBuildSimTree(nfa, "a");
    const nodes = walk(t.vRoot.children[0]);
    const q2 = nodes.find((n) => n.state === "q2");
    const e = nfaExplainConfig(nfa, chars, q2, { active: true });
    assert.equal(e.role, "accepted");
    assert.equal(e.arrival.via, "q1");
    assert.equal(e.arrival.to, "q2");
    assert.equal(e.arrival.epsBefore, 1);
    assert.equal(e.consumed, "a");
    assert.equal(nfaExplainConfig(nfa, chars, nodes[0]).role, "initial");
    assert.deepEqual([...nfaExplainConfig(nfa, chars, nodes[0]).closure], ["q0", "q1"]);
  });

  test("nfaEdgeCells: the table cells an edge uses, ε-hops included", () => {
    const { nfaEdgeCells, nfaEpsPath } = load("nfa.js");
    const t = nfaBuildSimTree(nfa, "a");
    const q2 = walk(t.vRoot.children[0]).find((n) => n.state === "q2");
    assert.deepEqual([...nfaEdgeCells(nfa, [..."a"], q2)], ["q0|ε", "q1|a"]);
    assert.deepEqual([...nfaEdgeCells(nfa, [..."a"], t.vRoot.children[0])], []);
    assert.deepEqual([...nfaEpsPath(nfa, "q0", "q1")], ["q0", "q1"]);
    assert.equal(nfaEpsPath(nfa, "q1", "q0"), null);
    assert.deepEqual([...nfaEpsPath(nfa, "q0", "q0")], ["q0"]);
  });

  test("nfaExplainConfig: dead ends and rejections explain themselves", () => {
    const t = nfaBuildSimTree(nfa, "bb");
    const nodes = walk(t.vRoot.children[0]);
    const dead = nodes.find((n) => n.dead);
    assert.match(nfaExplainConfig(nfa, [..."bb"], dead).why, /no state of the ε-closure .* has a transition on/);
    const t2 = nfaBuildSimTree(nfa, "b");
    const rej = walk(t2.vRoot.children[0]).find((n) => n.rejected);
    assert.match(nfaExplainConfig(nfa, ["b"], rej).why, /not an accepting state/);
  });
})();

// ── The error state ──
test("error state: a stuck branch moves to it and stays for the rest of the input", () => {
  const { nfaErrorName, nfaErrorSymbols, NFA_WILD } = load("nfa.js");
  const n = nfa(["q0", "q1"], "q0", ["q1"], [["q0", "a", "q1"]]);
  n.alphabet = ["a", "b"];
  assert.equal(nfaErrorName(n), "err");
  assert.equal(nfaErrorName({ states: ["err", "err′"] }), "err′′");
  assert.deepEqual([...nfaErrorSymbols(n, n.alphabet, "q0")], ["b"]);
  assert.deepEqual([...nfaErrorSymbols(n, n.alphabet, "q1")], ["a", "b"]);
  const t = nfaBuildSimTree(n, "abc", 512, { errorName: "err" });
  assert.equal(t.accepted, false);
  const walk = (x, out = []) => { out.push(x); x.children.forEach((c) => walk(c, out)); return out; };
  const errs = walk(t.vRoot).filter((x) => x.error);
  assert.deepEqual(errs.map((x) => x.depth), [2, 3]);
  assert.equal(errs[1].parent, errs[0]);
  assert.equal(errs[1].rejected, true);
  // the explanation and the table cell of an error move
  const { nfaExplainConfig, nfaEdgeCells } = load("nfa.js");
  assert.equal(nfaExplainConfig(n, [..."abc"], errs[0]).role, "error");
  assert.deepEqual([...nfaEdgeCells(n, [..."abc"], errs[0])], ["q1|b"]);
  assert.deepEqual([...nfaEdgeCells(n, [..."abc"], errs[1])], ["err|" + NFA_WILD]);
  // without the option nothing changes
  assert.equal(walk(nfaBuildSimTree(n, "abc").vRoot).some((x) => x.error), false);
});

test("error state: an ε-move into a state that can move keeps the branch alive", () => {
  const { nfaErrorSymbols } = load("nfa.js");
  const n = nfa(["p", "q"], "p", ["q"], [["p", "ε", "q"], ["q", "a", "q"]]);
  assert.deepEqual([...nfaErrorSymbols(n, ["a"], "p")], []);
});
