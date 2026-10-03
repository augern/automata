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
