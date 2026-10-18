const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { parseDerivationGrammar, derivMatchesRange, derivApply, derivIsDone } = load("grammar.js", "derivation.js");
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

// ── Random derivation ─────────────────────────────────────────────────
const { derivTerminalRatio, derivMoves, derivHash, derivUnit, derivRandomMove, derivOutcome } = load("grammar.js", "derivation.js");

// Run a whole random derivation; returns { forms, outcome } (forms[0] = start).
function randomRun(g, seed, cap = 300) {
  let form = [g.start];
  const forms = [form];
  for (let i = 0; i < cap; i++) {
    const m = derivRandomMove(g, form, seed, i);
    if (!m) return { forms, outcome: derivOutcome(g, form) };
    form = derivApply(form, m.lo, m.hi, g.rules[m.ruleIdx]);
    forms.push(form);
  }
  return { forms, outcome: "capped" };
}

test("derivMoves lists every (rule, position) match, including multi-symbol LHS", () => {
  const g = parseDerivationGrammar("S -> a S | b\nS a -> b");
  const moves = derivMoves(g, ["S", "a", "S"]).map((m) => `${m.ruleIdx}@${m.lo}-${m.hi}`);
  // rules: 0 S -> a S, 1 S -> b, 2 S a -> b; form: S a S
  assert.deepEqual([...moves].sort(), ["0@0-0", "0@2-2", "1@0-0", "1@2-2", "2@0-1"]);
  assert.equal(derivMoves(g, ["a", "b"]).length, 0);
});

test("derivMoves agrees with derivIsDone", () => {
  const g = parseDerivationGrammar(ANBNCN);
  for (const form of [["S"], ["a", "S", "B", "C"], ["a", "b", "c"], [], ["C", "B"], ["a", "a", "b", "b", "c", "c"]]) {
    assert.equal(derivMoves(g, form).length === 0, derivIsDone(g, form), form.join(" "));
  }
});

test("derivHash and derivUnit are deterministic and spread out", () => {
  assert.equal(derivHash(7, 3), derivHash(7, 3));
  assert.notEqual(derivHash(7, 3), derivHash(7, 4));
  assert.notEqual(derivHash(7, 3), derivHash(8, 3));
  const us = Array.from({ length: 2000 }, (_, i) => derivUnit(derivHash(12345, i)));
  assert.ok(us.every((u) => u >= 0 && u < 1));
  const mean = us.reduce((a, b) => a + b) / us.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05, "mean " + mean);
  const buckets = new Array(10).fill(0);
  us.forEach((u) => buckets[Math.floor(u * 10)]++);
  assert.ok(buckets.every((b) => b > 120 && b < 280), JSON.stringify(buckets)); // roughly uniform
});

test("a random move is a pure function of seed, index and form (so Back then forward replays it)", () => {
  const g = parseDerivationGrammar("S -> a S b | S S | eps");
  const form = ["S", "S", "S"];
  const a = derivRandomMove(g, form, 99, 5);
  assert.deepEqual({ ...derivRandomMove(g, form, 99, 5) }, { ...a });
  // different seeds / indices eventually choose differently
  const picks = new Set();
  for (let seed = 0; seed < 50; seed++) { const m = derivRandomMove(g, form, seed, 5); picks.add(m.ruleIdx + "@" + m.lo); }
  assert.ok(picks.size > 3, "only " + picks.size + " distinct choices over 50 seeds");
});

test("the same seed always gives the same derivation; different seeds give different ones", () => {
  const g = parseDerivationGrammar("S -> a S b | a b | S S");
  const a = randomRun(g, 42), b = randomRun(g, 42);
  assert.deepEqual(a.forms.map((f) => f.join(" ")), b.forms.map((f) => f.join(" ")));
  const distinct = new Set();
  for (let seed = 1; seed <= 20; seed++) distinct.add(randomRun(g, seed).forms.map((f) => f.join(" ")).join("|"));
  assert.ok(distinct.size > 5);
});

test("every random step is a valid derivation step", () => {
  const g = parseDerivationGrammar("E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id");
  for (let seed = 0; seed < 20; seed++) {
    const { forms } = randomRun(g, seed, 25);
    for (let i = 1; i < forms.length; i++) {
      const before = forms[i - 1], after = forms[i];
      const ok = derivMoves(g, before).some((m) => derivApply(before, m.lo, m.hi, g.rules[m.ruleIdx]).join(" ") === after.join(" "));
      assert.ok(ok, `seed ${seed} step ${i}`);
    }
  }
});

test("random derivations of a terminating CFG end in a word (outcome terminal)", () => {
  const g = parseDerivationGrammar("S -> a S b | a b");
  for (let seed = 0; seed < 30; seed++) {
    const { forms, outcome } = randomRun(g, seed);
    assert.equal(outcome, "terminal", "seed " + seed);
    const word = forms.at(-1).join("");
    assert.match(word, /^(a+)(b+)$/);
    assert.equal(word.length % 2, 0);
  }
});

test("derivOutcome distinguishes a finished word from a dead end", () => {
  const g = parseDerivationGrammar(ANBNCN);
  assert.equal(derivOutcome(g, ["S"]), null);
  assert.equal(derivOutcome(g, ["a", "a", "b", "b", "c", "c"]), "terminal");
  // a B with no rule for "B" after a different symbol: stuck with nonterminals left
  assert.equal(derivOutcome(g, ["c", "B"]), "stuck");
  assert.equal(derivOutcome(g, []), "terminal");
});

test("random derivations of the context-sensitive aⁿbⁿcⁿ grammar can dead-end, and never invent terminals", () => {
  const g = parseDerivationGrammar(ANBNCN);
  const outcomes = { terminal: 0, stuck: 0, capped: 0 };
  for (let seed = 0; seed < 200; seed++) {
    const r = randomRun(g, seed, 60);
    outcomes[r.outcome]++;
    if (r.outcome === "terminal") assert.match(r.forms.at(-1).join(""), /^a+b+c+$/);
    if (r.outcome === "terminal") { const w = r.forms.at(-1).join(""); const n = w.length / 3; assert.equal(w, "a".repeat(n) + "b".repeat(n) + "c".repeat(n)); }
  }
  assert.ok(outcomes.terminal > 0, JSON.stringify(outcomes));
  assert.ok(outcomes.stuck > 0, "expected some dead ends: " + JSON.stringify(outcomes));
});

test("terminal ratio: 1 ends a branch, fewer nonterminals rate higher", () => {
  const g = parseDerivationGrammar("S -> a S | b | S S | eps | a b");
  const r = g.rules.map((rule) => derivTerminalRatio(g, rule));
  assert.deepEqual([...r], [1 / 2, 1, 1 / 3, 1, 1]);
});

test("bias favors nonterminal rules early and terminating rules late", () => {
  const g = parseDerivationGrammar("S -> S S | a");
  const count = (index) => {
    let term = 0;
    for (let seed = 0; seed < 2000; seed++) if (derivRandomMove(g, [g.start], seed, index).ruleIdx === 1) term++;
    return term / 2000;
  };
  const early = count(0), late = count(60);
  assert.ok(early > 0.2 && early < 0.5, "early " + early);
  assert.ok(late > 0.95, "late " + late);
});

test("random derivations of S -> S S | a | ( S ) usually finish within the run cap", () => {
  const g = parseDerivationGrammar("S -> S S | a | b");
  let done = 0;
  for (let seed = 0; seed < 200; seed++) {
    let form = [g.start];
    for (let i = 0; i < 200; i++) {
      const m = derivRandomMove(g, form, seed, i);
      if (!m) break;
      form = derivApply(form, m.lo, m.hi, g.rules[m.ruleIdx]);
    }
    if (derivOutcome(g, form) === "terminal") done++;
  }
  assert.ok(done >= 195, "finished " + done);
});
