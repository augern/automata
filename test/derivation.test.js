const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { parseDerivationGrammar, derivMatchesRange, derivApply, derivIsDone, derivTree, derivGraph } = load("grammar.js", "derivation.js");
const plain = (x) => JSON.parse(JSON.stringify(x));
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

test("derivation grammar: quoted terminals and <name> nonterminals", () => {
  const g = parseDerivationGrammar("<s> -> '|' <a> | eps\n<a> -> 'x y' | ''");
  assert.deepEqual(JSON.parse(JSON.stringify(g.rules.map((r) => r.rhs))), [["|", "<a>"], [], ["x y"], []]);
  assert.deepEqual([...g.nonterminals].sort(), ["<a>", "<s>"]);
  // an <name> that only appears on a right-hand side is still a nonterminal
  assert.ok(parseDerivationGrammar("S -> <t> a").nonterminals.has("<t>"));
});

// ── The derivation tree ──
// steps as the tool records them: the form, the rule applied and the range it rewrote
const stepsOf = (g, picks) => {
  const steps = [{ form: [g.start], ruleIdx: null, matchStart: null, matchEnd: null }];
  for (const [ruleIdx, pos] of picks) {
    const form = steps[steps.length - 1].form;
    steps.push({ form: derivApply(form, pos, pos + g.rules[ruleIdx].lhs.length - 1, g.rules[ruleIdx]), ruleIdx, matchStart: pos, matchEnd: pos + g.rules[ruleIdx].lhs.length - 1 });
  }
  return steps;
};
const frontier = (n) => (n.children.length ? n.children.flatMap(frontier) : [n.symbol]);
const frontierOf = (t) => plain(frontier(t.root));

test("tree: the start symbol alone is a single node", () => {
  const g = parseDerivationGrammar("S -> a S b | ε");
  const t = derivTree(g, stepsOf(g, []));
  assert.equal(t.root.symbol, "S");
  assert.equal(t.root.children.length, 0);
  assert.deepEqual(plain(t.forms), [[0]]);
});

test("tree: each step expands one node, numbered with the step and the production", () => {
  const g = parseDerivationGrammar("S -> a S b | ε");
  const t = derivTree(g, stepsOf(g, [[0, 0], [0, 1], [1, 2]]));
  assert.deepEqual(frontierOf(t), ["a", "a", "ε", "b", "b"]);
  const s1 = t.root, s2 = s1.children[1], s3 = s2.children[1];
  assert.deepEqual([s1.badge, s2.badge, s3.badge], ["1", "2", "3"]);
  assert.deepEqual([s1.ruleIdx, s2.ruleIdx, s3.ruleIdx], [1, 1, 2]);
  assert.deepEqual(plain(t.stepNode.slice(1)), [s1.id, s2.id, s3.id]);
  assert.deepEqual(plain(t.lastNew), [s3.children[0].id]);
  // the forms' ids follow the symbols: the last form is a a b b, without the ε node
  assert.deepEqual(plain(t.forms[3]), plain([s1.children[0], s2.children[0], s2.children[2], s1.children[2]].map((n) => n.id)));
});

test("tree: the same tree whatever the order of the steps, but the numbers differ", () => {
  const g = parseDerivationGrammar("E -> T + T | T\nT -> x");
  const left = derivTree(g, stepsOf(g, [[0, 0], [2, 0], [2, 2]]));
  const right = derivTree(g, stepsOf(g, [[0, 0], [2, 2], [2, 0]]));
  assert.deepEqual(frontierOf(left), frontierOf(right));
  assert.equal(left.root.children[0].badge, "2");
  assert.equal(left.root.children[2].badge, "3");
  assert.equal(right.root.children[0].badge, "3");
  assert.equal(right.root.children[2].badge, "2");
});

// ── The derivation graph ──
const symbolsOf = (d, ids) => plain(ids.map((id) => d.nodes[id].symbol));
// S => aSBC => aaBCBC => aaBBCC (C B -> B C) => aabBCC => aabbCC => aabbcC => aabbcc
const ABC_PICKS = [[0, 0], [1, 1], [2, 3], [3, 1], [4, 2], [5, 3], [6, 4]];

test("graph: for a context-free grammar every box has one input and the rows are the forms", () => {
  const g = parseDerivationGrammar("S -> a S b | ε");
  const d = derivGraph(g, stepsOf(g, [[0, 0], [0, 1], [1, 2]]));
  assert.deepEqual(plain(d.boxes.map((b) => b.inputs.length)), [1, 1, 1]);
  assert.deepEqual(plain(d.boxes.map((b) => b.context.length)), [0, 0, 0]);
  assert.deepEqual(plain(d.boxes.map((b) => b.outputs.length)), [3, 3, 0]);
  assert.deepEqual(plain(d.rows.map((r) => symbolsOf(d, r))), [["S"], ["a", "S", "b"], ["a", "a", "S", "b", "b"], ["a", "a", "b", "b"]]);
  // the occurrences carry over from row to row
  assert.deepEqual(plain(d.rows[3]), plain([d.rows[2][0], d.rows[2][1], d.rows[2][3], d.rows[2][4]]));
});

test("graph: the context of a rule stays, only the rest is rewritten", () => {
  const g = parseDerivationGrammar(ANBNCN);
  const d = derivGraph(g, stepsOf(g, ABC_PICKS));
  const box = d.boxes[3]; // a B -> a b
  assert.equal(g.rules[box.ruleIdx].lhs.join(" "), "a B");
  assert.deepEqual(symbolsOf(d, box.inputs), ["B"]);
  assert.deepEqual(symbolsOf(d, box.context), ["a"]);
  assert.deepEqual(symbolsOf(d, box.outputs), ["b"]);
  // the context occurrence is in the form before and after, and is never rewritten
  assert.ok(d.rows[3].includes(box.context[0]) && d.rows[4].includes(box.context[0]));
  assert.equal(d.nodes[box.context[0]].died, null);
  assert.equal(d.nodes[box.inputs[0]].died, 4);
});

test("graph: a rule that permutes has two inputs, two outputs and no context", () => {
  const g = parseDerivationGrammar(ANBNCN);
  const d = derivGraph(g, stepsOf(g, ABC_PICKS));
  const box = d.boxes[2]; // C B -> B C
  assert.deepEqual(symbolsOf(d, box.inputs), ["C", "B"]);
  assert.deepEqual(symbolsOf(d, box.outputs), ["B", "C"]);
  assert.equal(box.context.length, 0);
  assert.deepEqual(plain(box.inputs.map((id) => d.nodes[id].died)), [3, 3]);
  assert.deepEqual(plain(box.outputs.map((id) => d.nodes[id].born)), [3, 3]);
});

test("graph: every occurrence is rewritten once or is in the last form; the last form is the word", () => {
  const g = parseDerivationGrammar(ANBNCN);
  const d = derivGraph(g, stepsOf(g, ABC_PICKS));
  const last = d.rows[d.rows.length - 1];
  assert.deepEqual(symbolsOf(d, last), ["a", "a", "b", "b", "c", "c"]);
  for (const n of d.nodes) assert.ok((n.died === null) === last.includes(n.id), `node ${n.id}`);
  assert.equal(d.nodes.length, 1 + d.boxes.reduce((n, b) => n + b.outputs.length, 0));
});

test("graph: the lanes keep the order of every form and are shared only one after the other", () => {
  const g = parseDerivationGrammar(ANBNCN);
  const d = derivGraph(g, stepsOf(g, ABC_PICKS));
  for (const row of d.rows) {
    const lanes = row.map((id) => d.nodes[id].lane);
    assert.deepEqual(plain(lanes), plain([...lanes].sort((a, b) => a - b)));
    assert.equal(new Set(lanes).size, lanes.length);
  }
  for (const a of d.nodes) for (const b of d.nodes) {
    if (a.id < b.id && a.lane === b.lane) assert.ok((a.died !== null && a.died <= b.born) || (b.died !== null && b.died <= a.born), `lane ${a.lane}: ${a.id} and ${b.id}`);
  }
  // aabbcc needs the width of the widest form, not a lane for each of the 14 symbols
  assert.equal(d.lanes, 6);
  assert.equal(d.nodes.length, 14);
});

test("graph: what a step makes takes the lanes of what it rewrote", () => {
  const g = parseDerivationGrammar(ANBNCN);
  const d = derivGraph(g, stepsOf(g, ABC_PICKS));
  const perm = d.boxes[2]; // C B -> B C
  assert.deepEqual(plain(perm.outputs.map((id) => d.nodes[id].lane)), plain(perm.inputs.map((id) => d.nodes[id].lane)));
  const grow = d.boxes[0]; // S -> a S B C: the lane of S, then three more, in order
  const lanes = grow.outputs.map((id) => d.nodes[id].lane);
  assert.equal(lanes[0], d.nodes[grow.inputs[0]].lane);
  assert.deepEqual(plain(lanes), plain([...lanes].sort((a, b) => a - b)));
  assert.equal(new Set(lanes).size, 4);
});

test("graph: at least one symbol is rewritten even when the right side repeats the left", () => {
  const g = parseDerivationGrammar("S -> a b\na b -> a b b");
  const d = derivGraph(g, stepsOf(g, [[0, 0], [1, 0]]));
  const box = d.boxes[1];
  assert.equal(box.inputs.length, 1);
  assert.deepEqual(symbolsOf(d, box.context), ["a"]);
  assert.deepEqual(symbolsOf(d, box.outputs), ["b", "b"]);
});

test("graph: an erasing rule has no outputs", () => {
  const g = parseDerivationGrammar("S -> a B\na B -> a");
  const d = derivGraph(g, stepsOf(g, [[0, 0], [1, 0]]));
  assert.deepEqual(plain(d.boxes[1].outputs), []);
  assert.deepEqual(symbolsOf(d, d.rows[2]), ["a"]);
});
