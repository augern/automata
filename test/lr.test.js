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

// ── Parser driver ─────────────────────────────────────────────────────
const { lrPickAction, lrDecode, lrGoto } = load("grammar.js", "lr.js");

function parseTokens(g, tables, input) {
  const tokens = [...input.split(/\s+/).filter(Boolean), "$"];
  const stack = [0];
  let pos = 0;
  const actions = [];
  for (let n = 0; n < 1000; n++) {
    const state = stack[stack.length - 1];
    const entry = lrPickAction(tables.action[state][tokens[pos]]);
    if (!entry) return { accepted: false, actions };
    const d = lrDecode(entry);
    actions.push(d.type === "reduce" ? "r" + d.ruleIdx : d.type === "shift" ? "s" + d.next : "acc");
    if (d.type === "accept") return { accepted: true, actions };
    if (d.type === "shift") {
      stack.push(d.next);
      pos++;
    } else {
      const rule = g.rules[d.ruleIdx];
      stack.length -= rule.rhs.length;
      const next = lrGoto(tables, stack[stack.length - 1], rule.lhs);
      if (next === undefined) return { accepted: false, actions };
      stack.push(next);
    }
  }
  throw new Error("parser did not terminate");
}

test("driver: all four methods accept/reject the same strings on a conflict-free grammar", () => {
  for (const mode of ["SLR1", "LALR1", "LR1"]) {
    const { g, tables } = lr(EXPR, mode);
    assert.ok(parseTokens(g, tables, "id + id * id").accepted, mode);
    assert.ok(parseTokens(g, tables, "( id + id ) * id").accepted, mode);
    assert.equal(parseTokens(g, tables, "id + + id").accepted, false, mode);
    assert.equal(parseTokens(g, tables, "( id").accepted, false, mode);
  }
});

test("driver: parsing 'id' shifts, then reduces F->id, T->F, E->T, then accepts", () => {
  const { g, tables } = lr(EXPR, "SLR1");
  // rules: 0 E'->E, 1 E->E+T, 2 E->T, 3 T->T*F, 4 T->F, 5 F->(E), 6 F->id
  const actions = parseTokens(g, tables, "id").actions;
  assert.match(actions[0], /^s\d+$/);
  assert.deepEqual(actions.slice(1), ["r6", "r4", "r2", "acc"]);
});

test("lrPickAction prefers shift over reduce on a conflicted cell", () => {
  assert.equal(lrPickAction(["r2", "s7"]), "s7");
  assert.equal(lrPickAction(["r2", "r3"]), "r2");
  assert.equal(lrPickAction("acc"), "acc");
  assert.equal(lrPickAction(undefined), undefined);
});

test("S -> a S | a is SLR(1) and parses a+", () => {
  const { g, tables } = lr("S -> a S | a", "SLR1");
  assert.equal(tables.conflicts.length, 0);
  assert.ok(parseTokens(g, tables, "a a a").accepted);
  assert.equal(parseTokens(g, tables, "").accepted, false);
});

// ── conflict explanations ──────────────────────────────────────────────
(function () {
  const { lrExplainConflict, lrCompareMethods } = load("grammar.js", "lr.js");
  const ARITH = "S -> E\nE -> E + T | T\nT -> id";
  test("lrExplainConflict describes a shift/reduce conflict and why the method fails", () => {
    const { g, tables } = lr(ARITH, "LR0");
    const c = tables.conflicts[0];
    const e = lrExplainConflict(g, "LR0", c);
    assert.equal(e.kind, "shift/reduce");
    assert.match(e.text, /shift \+ or reduce by production/);
    assert.match(e.text, /LR\(0\) uses no lookahead/);
  });
  test("lrCompareMethods counts conflicts per method", () => {
    const g = lr(ARITH, "LR0").g;
    const n = lrCompareMethods(g);
    assert.ok(n.LR0 > 0);
    assert.equal(n.SLR1, 0);
    assert.equal(n.LALR1, 0);
    assert.equal(n.LR1, 0);
    const dangling = lr("S -> i S | i S e S | a", "LR1").g;
    assert.ok(lrCompareMethods(dangling).LR1 > 0);
  });
})();
