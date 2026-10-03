const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { parseBNF, computeFirst, computeFollow, EPSILON } = load("grammar.js");
const sorted = (set) => [...set].sort();

const EXPR = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`;

test("parseBNF: rules, alternatives and augmentation", () => {
  const g = parseBNF(EXPR);
  assert.equal(g.rules.length, 7); // 6 productions + augmented start
  assert.equal(g.rules[0].lhs, "E'");
  assert.deepEqual([...g.rules[0].rhs], ["E"]);
  assert.equal(g.start, "E'");
  assert.deepEqual(sorted(g.nonterminals), ["E", "E'", "F", "T"]);
  assert.deepEqual(sorted(g.terminals), ["$", "(", ")", "*", "+", "id"]);
});

test("parseBNF: no augmentation keeps the first LHS as start", () => {
  const g = parseBNF(EXPR, false);
  assert.equal(g.start, "E");
  assert.equal(g.rules.length, 6);
});

test("parseBNF: epsilon spellings produce an empty RHS", () => {
  for (const e of ["eps", "epsilon", EPSILON, "''", '""']) {
    const g = parseBNF(`S -> a S | ${e}`, false);
    assert.equal(g.rules[1].rhs.length, 0);
  }
});

test("parseBNF: comments and blank lines are ignored; errors are reported", () => {
  assert.equal(parseBNF("// c\n\nS -> a", false).rules.length, 1);
  assert.throws(() => parseBNF(""), /Empty grammar/);
  assert.throws(() => parseBNF("S a"), /Missing '->'/);
  assert.throws(() => parseBNF("-> a"), /Missing LHS/);
});

test("parseBNF: augmented start name avoids collisions", () => {
  const g = parseBNF("S -> S' a\nS' -> b");
  assert.equal(g.start, "S''");
});

test("FIRST/FOLLOW of the dragon-book expression grammar", () => {
  const g = parseBNF(EXPR);
  const first = computeFirst(g);
  const follow = computeFollow(g, first);
  for (const nt of ["E", "T", "F"]) assert.deepEqual(sorted(first[nt]), ["(", "id"]);
  assert.deepEqual(sorted(follow.E), ["$", ")", "+"]);
  assert.deepEqual(sorted(follow.T), ["$", ")", "*", "+"]);
  assert.deepEqual(sorted(follow.F), ["$", ")", "*", "+"]);
});

test("FIRST/FOLLOW with nullable nonterminals", () => {
  const g = parseBNF(`S -> A B
A -> a | eps
B -> b | eps`);
  const first = computeFirst(g);
  const follow = computeFollow(g, first);
  assert.deepEqual(sorted(first.A), ["a", EPSILON]);
  assert.deepEqual(sorted(first.B), ["b", EPSILON]);
  assert.deepEqual(sorted(first.S), ["a", "b", EPSILON]);
  assert.deepEqual(sorted(follow.A), ["$", "b"]);
  assert.deepEqual(sorted(follow.B), ["$"]);
});
