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

test("parseBNF: quoted terminals may contain | and spaces; quoted eps is a terminal, empty quotes are ε", () => {
  const g = parseBNF("R -> R '|' C | C\nC -> 'a b' | 'eps' | \"|\" | ''", false);
  assert.deepEqual(JSON.parse(JSON.stringify(g.rules.map((r) => r.rhs))), [["R", "|", "C"], ["C"], ["a b"], ["eps"], ["|"], []]);
  assert.deepEqual(sorted(g.terminals), ["$", "a b", "eps", "|"]);
  assert.throws(() => parseBNF("S -> 'a", false), /Unterminated quote/);
});

test("bnfAlternatives: offsets of alternatives and symbols", () => {
  const { bnfAlternatives } = load("grammar.js");
  const alts = bnfAlternatives(" a '|' b | c ");
  assert.equal(alts.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(alts[0].toks.map((t) => [t.sym, t.from, t.to]))), [["a", 1, 2], ["|", 3, 6], ["b", 7, 8]]);
  assert.deepEqual([alts[0].from, alts[0].to, alts[1].from, alts[1].to], [1, 8, 11, 12]);
});

test("parseBNF: a <name> in angle brackets must have a rule; quoted or bare < > are terminals", () => {
  assert.throws(() => parseBNF("<s> -> <a> x\n<b> -> y", false), /No rule for <a>/);
  assert.doesNotThrow(() => parseBNF("<s> -> <a> x\n<a> -> y", false));
  const g = parseBNF("E -> E < E | '<a>' | >", false);
  assert.deepEqual(sorted(g.terminals), ["$", "<", "<a>", ">"]);
});

test("parseBNF: a doubled quote inside quotes is the quote itself; '' stays ε", () => {
  const g = parseBNF("S -> '''' | 'it''s' | \"'\" | '\"' | ''", false);
  assert.deepEqual(JSON.parse(JSON.stringify(g.rules.map((r) => r.rhs))), [["'"], ["it's"], ["'"], ['"'], []]);
  assert.throws(() => parseBNF("S -> 'a''", false), /Unterminated quote/);
});
