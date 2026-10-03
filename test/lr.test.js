const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { parseBNF, computeFirst, buildLR0, buildLR1, mergeLR1toLALR, buildTables } = load("grammar.js", "lr.js");

// Build the automaton + tables the same way lr-tool.html's build() does.
function lr(text, mode) {
  const g = parseBNF(text);
  const auto = mode === "LR0" || mode === "SLR1" ? buildLR0(g) : mode === "LR1" ? buildLR1(g) : mergeLR1toLALR(buildLR1(g));
  const tables = buildTables(g, auto, mode === "LALR1" ? "LR1" : mode);
  return { g, auto, tables };
}

// Textbook grammars (Aho, Lam, Sethi, Ullman — "Compilers", ch. 4).
const EXPR = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`;
const CC = `S -> C C
C -> c C | d`;
const LRVALUE = `S -> L = R | R
L -> * R | id
R -> L`;

test("expression grammar: 12 LR(0) states, 22 LR(1) states, 12 LALR(1) states", () => {
  assert.equal(lr(EXPR, "LR0").auto.states.length, 12);
  assert.equal(lr(EXPR, "LR1").auto.states.length, 22);
  assert.equal(lr(EXPR, "LALR1").auto.states.length, 12);
});

test("expression grammar: LR(0) has conflicts, SLR(1)/LALR(1)/LR(1) do not", () => {
  assert.ok(lr(EXPR, "LR0").tables.conflicts.length > 0);
  for (const m of ["SLR1", "LALR1", "LR1"]) assert.equal(lr(EXPR, m).tables.conflicts.length, 0, m);
});

test("S -> CC grammar (Fig. 4.41): 10 LR(1) states merge to 7 LALR(1) states", () => {
  assert.equal(lr(CC, "LR1").auto.states.length, 10);
  assert.equal(lr(CC, "LALR1").auto.states.length, 7);
  assert.equal(lr(CC, "LR0").auto.states.length, 7);
});

test("L = R grammar (Ex. 4.48): SLR(1) conflict, but LALR(1) and LR(1) are conflict-free", () => {
  const slr = lr(LRVALUE, "SLR1").tables.conflicts;
  assert.equal(slr.length, 1);
  assert.equal(slr[0].symbol, "=");
  assert.equal(lr(LRVALUE, "LALR1").tables.conflicts.length, 0);
  assert.equal(lr(LRVALUE, "LR1").tables.conflicts.length, 0);
  assert.equal(lr(LRVALUE, "LR0").auto.states.length, 10);
  assert.equal(lr(LRVALUE, "LR1").auto.states.length, 14);
});

test("tables: accept action exists and ACTION/GOTO are consistent with edges", () => {
  const { auto, tables, g } = lr(EXPR, "SLR1");
  const accepting = tables.action.filter((row) => row["$"] === "acc");
  assert.equal(accepting.length, 1);
  for (const { s, t, label } of auto.edges) {
    if (g.nonterminals.has(label)) assert.equal(tables.goto[s][label], t);
    else assert.equal(tables.action[s][label], "s" + t);
  }
});

test("state 0 is the closure of the augmented start item", () => {
  const { auto } = lr(CC, "LR0");
  const items = Array.from(auto.states[0].items, (i) => i.rule + ":" + i.dot).sort();
  // S'->.S, S->.CC, C->.cC, C->.d
  assert.deepEqual(items, ["0:0", "1:0", "2:0", "3:0"]);
});
