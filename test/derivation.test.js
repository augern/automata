const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { parseDerivationGrammar, derivMatchesRange, derivApply, derivIsDone } = load("derivation.js");
const arr = (x) => [...x];

// The classic context-sensitive grammar for aⁿbⁿcⁿ (n ≥ 1).
const ANBNCN = `S -> a S B C | a B C
C B -> B C
a B -> a b
b B -> b b
b C -> b c
c C -> c c`;

test("parser: single-symbol and multi-symbol left-hand sides", () => {
  const g = parseDerivationGrammar(ANBNCN);
  assert.equal(g.start, "S");
  assert.equal(g.rules.length, 7);
  assert.deepEqual(arr(g.rules[2].lhs), ["C", "B"]);
  assert.deepEqual(arr(g.rules[2].rhs), ["B", "C"]);
  // S from the single-symbol LHS; B and C from uppercase tokens in multi-symbol LHSs.
  assert.deepEqual([...g.nonterminals].sort(), ["B", "C", "S"]);
});

test("parser: ε spellings, comments and the → arrow", () => {
  for (const e of ["eps", "epsilon", "ε", "''", '""']) {
    assert.equal(parseDerivationGrammar(`S → a S | ${e}`).rules[1].rhs.length, 0, e);
  }
  assert.equal(parseDerivationGrammar("// comment\n\nS -> a").rules.length, 1);
});

test("parser: errors", () => {
  assert.throws(() => parseDerivationGrammar(""), /Empty grammar/);
  assert.throws(() => parseDerivationGrammar("S a"), /Missing/);
  assert.throws(() => parseDerivationGrammar("-> a"), /Empty LHS/);
  assert.throws(() => parseDerivationGrammar("a B -> a b"), /No single-symbol LHS/);
});

test("range matching is exact and positional", () => {
  const form = ["a", "C", "B", "C"];
  assert.equal(derivMatchesRange(form, 1, 2, ["C", "B"]), true);
  assert.equal(derivMatchesRange(form, 2, 3, ["C", "B"]), false);
  assert.equal(derivMatchesRange(form, 1, 1, ["C", "B"]), false);
  assert.equal(derivMatchesRange(form, 1, 1, ["C"]), true);
});

test("applying a rule replaces exactly the selected range", () => {
  const rule = { lhs: ["C", "B"], rhs: ["B", "C"] };
  assert.deepEqual(arr(derivApply(["a", "C", "B", "C"], 1, 2, rule)), ["a", "B", "C", "C"]);
  assert.deepEqual(arr(derivApply(["S"], 0, 0, { lhs: ["S"], rhs: [] })), []);
});

test("derives aabbcc step by step; done only when no rule applies", () => {
  const g = parseDerivationGrammar(ANBNCN);
  const idx = (lhs, rhs) => g.rules.findIndex((r) => r.lhs.join(" ") === lhs && r.rhs.join(" ") === rhs);
  // [lhs, rhs, lo, hi]
  const plan = [
    ["S", "a S B C", 0, 0],
    ["S", "a B C", 1, 1],       // a a B C B C
    ["C B", "B C", 3, 4],       // a a B B C C
    ["a B", "a b", 1, 2],       // a a b B C C
    ["b B", "b b", 2, 3],       // a a b b C C
    ["b C", "b c", 3, 4],       // a a b b c C
    ["c C", "c c", 4, 5],       // a a b b c c
  ];
  let form = [g.start];
  for (const [lhs, rhs, lo, hi] of plan) {
    const ri = idx(lhs, rhs);
    assert.ok(ri >= 0, lhs + " -> " + rhs);
    assert.ok(derivMatchesRange(form, lo, hi, g.rules[ri].lhs), `${lhs} does not match [${lo},${hi}] of ${form.join(" ")}`);
    assert.equal(derivIsDone(g, form), false);
    form = derivApply(form, lo, hi, g.rules[ri]);
  }
  assert.deepEqual(arr(form), ["a", "a", "b", "b", "c", "c"]);
  assert.equal(derivIsDone(g, form), true);
});

test("done detection sees a rule LHS anywhere in the form, including the empty form", () => {
  const g = parseDerivationGrammar("S -> a S b | eps");
  assert.equal(derivIsDone(g, []), true);
  assert.equal(derivIsDone(g, ["a", "b"]), true);
  assert.equal(derivIsDone(g, ["a", "S", "b"]), false);
});
