const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { pdaApplyStack, pdaStackMatch, pdaAcceptsString, pdaBuildSimTree, pdaEpsClosure, pdaIsAccepting } = load("pda.js");

const r = (from, input, pop, to, push) => ({ from, input, pop, to, push });
function pda(states, start, accepts, rules, { initStack = "⊥", acceptMode = "final-state" } = {}) {
  return { states, start: states.indexOf(start), accepts: new Set(accepts.map((a) => states.indexOf(a))), rules, initStack, acceptMode };
}
const accepts = (m, w) => pdaAcceptsString(m, w).accepted;
const treeAccepts = (m, w) => {
  const t = pdaBuildSimTree(m, [...w]);
  return { accepted: t.frontiers.at(-1).some((n) => pdaIsAccepting(m, n)), truncated: t.truncated };
};

// aⁿbⁿ (n ≥ 0), acceptance by final state.
const ANBN = pda(["q0", "q1", "q2"], "q0", ["q2"], [
  r("q0", "", "⊥", "q2", "⊥"),
  r("q0", "a", "⊥", "q0", "A⊥"),
  r("q0", "a", "A", "q0", "AA"),
  r("q0", "b", "A", "q1", ""),
  r("q1", "b", "A", "q1", ""),
  r("q1", "", "⊥", "q2", "⊥"),
]);

// wwᴿ over {a,b}, nondeterministic guess of the middle, acceptance by empty stack.
const PAL = pda(["p", "q"], "p", [], [
  r("p", "a", "", "p", "a"),
  r("p", "b", "", "p", "b"),
  r("p", "", "", "q", ""),
  r("q", "a", "a", "q", ""),
  r("q", "b", "b", "q", ""),
  r("q", "", "⊥", "q", ""),
], { acceptMode: "empty-stack" });

test("pdaApplyStack: leftmost push char becomes the top", () => {
  assert.deepEqual([...pdaApplyStack(["⊥"], "⊥", "AB⊥")], ["⊥", "B", "A"]);
  assert.deepEqual([...pdaApplyStack(["x", "y"], "", "")], ["x", "y"]);
  assert.deepEqual([...pdaApplyStack(["x", "y"], "y", "")], ["x"]);
});

test("pdaStackMatch: ε-pop always matches, otherwise needs the top symbol", () => {
  assert.equal(pdaStackMatch([], ""), true);
  assert.equal(pdaStackMatch([], "a"), false);
  assert.equal(pdaStackMatch(["b", "a"], "a"), true);
  assert.equal(pdaStackMatch(["a", "b"], "a"), false);
});

test("aⁿbⁿ accepts exactly the balanced strings", () => {
  for (const w of ["", "ab", "aabb", "aaabbb"]) assert.ok(accepts(ANBN, w), w);
  for (const w of ["a", "b", "ba", "aab", "abb", "abab", "aabbb"]) assert.equal(accepts(ANBN, w), false, w);
});

test("palindromes wwᴿ by empty stack, with nondeterministic middle", () => {
  for (const w of ["", "aa", "abba", "baab", "aabbaa"]) assert.ok(accepts(PAL, w), w);
  for (const w of ["a", "ab", "abab", "aab", "abbaa"]) assert.equal(accepts(PAL, w), false, w);
});

test("simulation tree and exact recogniser agree on every string up to length 7", () => {
  const strings = [""];
  for (let len = 1; len <= 7; len++) for (let i = 0; i < 2 ** len; i++) strings.push(i.toString(2).padStart(len, "0").replace(/0/g, "a").replace(/1/g, "b"));
  for (const m of [ANBN, PAL]) {
    for (const w of strings) {
      const t = treeAccepts(m, w);
      if (t.truncated) continue; // tree is allowed to be incomplete
      assert.equal(t.accepted, accepts(m, w), JSON.stringify(w));
    }
  }
});

test("tree structure: ε-steps keep symDepth, symbol steps increment it", () => {
  const t = pdaBuildSimTree(ANBN, ["a"]);
  const root = t.vRoot.children[0];
  assert.equal(root.symDepth, 0);
  const viaA = root.children.find((c) => c.edgeInput === "a");
  assert.equal(viaA.symDepth, 1);
  const viaEps = root.children.find((c) => c.edgeInput === "");
  assert.equal(viaEps.symDepth, 0);
  assert.equal(t.history.length, 2);
});

test("dead nodes are marked when no rule applies", () => {
  const t = pdaBuildSimTree(ANBN, [..."b"]);
  assert.ok(t.frontiers.at(-1).length === 0 || t.vRoot.children[0].dead);
  assert.equal(accepts(ANBN, "b"), false);
});

test("an ε-pushing loop is cut off and reported as truncated", () => {
  const loop = pda(["s"], "s", [], [r("s", "", "", "s", "A")]);
  const res = pdaAcceptsString(loop, "", 50);
  assert.equal(res.truncated, true);
  assert.equal(pdaBuildSimTree(loop, [], 40).truncated, true);
  assert.equal(pdaEpsClosure(loop, [{ state: "s", stack: [] }], 10).configs.length <= 10, true);
});

test("rules to unknown states are ignored", () => {
  const m = pda(["s"], "s", ["s"], [r("s", "a", "", "ghost", "")]);
  assert.equal(accepts(m, "a"), false);
});

// ── pdaExplainConfig ───────────────────────────────────────────────────
const { pdaExplainConfig } = load("pda.js");
(function () {
  const anbn = {
    states: ["q0", "q1", "q2"], start: 0, accepts: new Set([2]), initStack: "⊥", acceptMode: "final-state",
    rules: [
      { from: "q0", input: "a", pop: "⊥", to: "q0", push: "A⊥" },
      { from: "q0", input: "a", pop: "A", to: "q0", push: "AA" },
      { from: "q0", input: "", pop: "⊥", to: "q2", push: "⊥" },
      { from: "q0", input: "b", pop: "A", to: "q1", push: "" },
      { from: "q1", input: "b", pop: "A", to: "q1", push: "" },
      { from: "q1", input: "", pop: "⊥", to: "q2", push: "⊥" },
    ],
  };
  const walk = (node, out = []) => { out.push(node); node.children.forEach((c) => walk(c, out)); return out; };

  test("pdaExplainConfig: start configuration, arrival and roles on a run that accepts", () => {
    const chars = [..."ab"];
    const t = pdaBuildSimTree(anbn, chars);
    const nodes = walk(t.vRoot.children[0]);
    const root = pdaExplainConfig(anbn, chars, nodes[0], { active: false });
    assert.equal(root.arrival, null);
    assert.equal(root.state, "q0");
    assert.equal(root.remaining, "ab");
    assert.deepEqual([...root.stack], ["⊥"]);
    const acc = nodes.find((n) => n.accepted);
    const e = pdaExplainConfig(anbn, chars, acc, { active: true, onAcceptPath: true });
    assert.equal(e.role, "accepted");
    assert.match(e.why, /accepting state/);
    assert.equal(e.consumed, "ab");
    assert.equal(e.remaining, "");
    assert.ok(e.arrival && e.arrival.fromState);
    assert.equal(e.onAcceptPath, true);
  });

  test("pdaExplainConfig: dead ends say which rule lookup failed; rejection says why", () => {
    const chars = [..."ba"];
    const t = pdaBuildSimTree(anbn, chars);
    const nodes = walk(t.vRoot.children[0]);
    const dead = nodes.find((n) => n.dead);
    const e = pdaExplainConfig(anbn, chars, dead, {});
    assert.equal(e.role, "dead");
    assert.match(e.why, /no rule applies in q\d when reading b with/);
    const chars2 = [..."a"];
    const t2 = pdaBuildSimTree(anbn, chars2);
    const rej = walk(t2.vRoot.children[0]).find((n) => n.rejected);
    assert.match(pdaExplainConfig(anbn, chars2, rej, {}).why, /not an accepting state/);
    const stackMode = { ...anbn, acceptMode: "empty-stack" };
    const t3 = pdaBuildSimTree(stackMode, chars2);
    const rej3 = walk(t3.vRoot.children[0]).find((n) => n.rejected);
    assert.match(pdaExplainConfig(stackMode, chars2, rej3, {}).why, /stack still holds/);
  });
})();
