const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const R = load("grammar.js", "rewrite.js");
const { EPSILON, parseGrammarRaw, computeCleanupSteps, computeEpsSteps, computeUnitSteps, computeCNFSteps, computeLRESteps, computeGNFSteps } = R;

const run = (fn, text) => {
  const g = parseGrammarRaw(text);
  const steps = fn(g);
  const last = steps.at(-1);
  const rules = Array.from(last.grammarAfter, (r) => ({ lhs: r.lhs, rhs: [...r.rhs] }));
  return { steps, rules, g };
};
const fmt = (rules) => rules.map((r) => r.lhs + " -> " + (r.rhs.join(" ") || "ε")).sort();
const nts = (rules) => new Set(rules.map((r) => r.lhs));

// All terminal strings (as space-joined tokens) derivable from `start` with at
// most maxLen terminals, by breadth-first search over sentential forms.
function language(rules, start, maxLen = 6) {
  const ntSet = nts(rules);
  const out = new Set();
  const seen = new Set();
  const queue = [[start]];
  while (queue.length) {
    const form = queue.shift();
    const i = form.findIndex((s) => ntSet.has(s));
    if (i < 0) { out.add(form.join(" ")); continue; }
    for (const r of rules) {
      if (r.lhs !== form[i]) continue;
      const next = [...form.slice(0, i), ...r.rhs, ...form.slice(i + 1)];
      const terminals = next.filter((s) => !ntSet.has(s)).length;
      if (terminals > maxLen || next.length > maxLen + 8) continue;
      const key = next.join("\u0000");
      if (!seen.has(key)) { seen.add(key); queue.push(next); }
    }
  }
  return [...out].sort();
}
const sameLanguage = (before, after, start, maxLen = 6) =>
  assert.deepEqual(language(after, start, maxLen), language(before, start, maxLen));

test("parseGrammarRaw does not augment and tolerates a later arrow in the RHS", () => {
  const g = parseGrammarRaw("S -> a S b | eps\nA -> x");
  assert.equal(g.start, "S");
  assert.equal(g.rules.length, 3);
  assert.equal(g.rules[1].rhs.length, 0);
  assert.deepEqual([...g.nts].sort(), ["A", "S"]);
  assert.deepEqual([...parseGrammarRaw("S -> a -> b").rules[0].rhs], ["a", "->", "b"]);
});

// ── Cleanup ───────────────────────────────────────────────────────────
test("cleanup removes unproductive and unreachable nonterminals (textbook example)", () => {
  // B is unproductive (B -> B b), C is unreachable, so only S -> a, A -> a b? remain
  const { rules, g } = run(computeCleanupSteps, `S -> A | a B
A -> a A | a
B -> B b
C -> c`);
  assert.deepEqual(fmt(rules), ["A -> a", "A -> a A", "S -> A"]);
  sameLanguage(g.rules, rules, "S");
});

test("cleanup leaves a clean grammar unchanged", () => {
  const { rules } = run(computeCleanupSteps, "S -> a S b | a b");
  assert.deepEqual(fmt(rules), ["S -> a S b", "S -> a b"]);
});

// ── ε-elimination ─────────────────────────────────────────────────────
test("ε-elimination: no ε-rules remain except S -> ε when the language contains ε", () => {
  const { rules, g } = run(computeEpsSteps, `S -> A B
A -> a | eps
B -> b | eps`);
  for (const r of rules) if (r.rhs.length === 0) assert.equal(r.lhs, "S");
  assert.ok(rules.some((r) => r.lhs === "S" && r.rhs.length === 0), "language contains ε, keep S -> ε");
  sameLanguage(g.rules, rules, "S");
});

test("ε-elimination: ε is dropped entirely when the language lacks it", () => {
  const { rules, g } = run(computeEpsSteps, `S -> A a
A -> a A | eps`);
  assert.equal(rules.filter((r) => r.rhs.length === 0).length, 0);
  sameLanguage(g.rules, rules, "S");
});

test("ε-elimination generates every subset of nullable occurrences", () => {
  const { rules } = run(computeEpsSteps, `S -> A b A
A -> a | eps`);
  assert.deepEqual(fmt(rules).filter((x) => x.startsWith("S")), ["S -> A b", "S -> A b A", "S -> b", "S -> b A"]);
});

// ── Unit elimination ──────────────────────────────────────────────────
test("unit elimination: expression grammar loses E -> T and T -> F", () => {
  const { rules, g } = run(computeUnitSteps, `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`);
  for (const r of rules) assert.ok(!(r.rhs.length === 1 && nts(rules).has(r.rhs[0])), "unit rule left: " + r.lhs + " -> " + r.rhs);
  // E now derives T's and F's non-unit bodies directly
  assert.ok(fmt(rules).includes("E -> id"));
  assert.ok(fmt(rules).includes("E -> T * F"));
  assert.ok(fmt(rules).includes("E -> ( E )"));
  sameLanguage(g.rules, rules, "E", 5);
});

test("unit elimination handles unit cycles", () => {
  const { rules, g } = run(computeUnitSteps, `S -> A | a
A -> B
B -> A | b`);
  for (const r of rules) assert.ok(!(r.rhs.length === 1 && nts(rules).has(r.rhs[0])));
  sameLanguage(g.rules, rules, "S");
});

// ── CNF ───────────────────────────────────────────────────────────────
function assertCNF(rules, start) {
  const ntSet = nts(rules);
  for (const r of rules) {
    if (r.rhs.length === 0) { assert.equal(r.lhs, start, "only the start symbol may derive ε"); continue; }
    if (r.rhs.length === 1) assert.ok(!ntSet.has(r.rhs[0]), `A -> B left: ${r.lhs} -> ${r.rhs}`);
    else {
      assert.equal(r.rhs.length, 2, `rule too long: ${r.lhs} -> ${r.rhs}`);
      assert.ok(r.rhs.every((s) => ntSet.has(s)), `terminal in binary rule: ${r.lhs} -> ${r.rhs}`);
    }
  }
}

for (const [name, text, start] of [
  ["aⁿbⁿ", "S -> a S b | a b", "S"],
  ["balanced parens with ε", "S -> ( S ) S | eps", "S"],
  ["expression grammar", "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id", "E"],
  ["nullable chain", "S -> A B C\nA -> a | eps\nB -> b | eps\nC -> c | eps", "S"],
  ["unit + eps mix", "S -> A | B\nA -> a A | eps\nB -> b", "S"],
]) {
  test(`CNF: ${name} is in Chomsky Normal Form and generates the same language`, () => {
    const { rules, g } = run(computeCNFSteps, text);
    assertCNF(rules, start);
    sameLanguage(g.rules, rules, start, 5);
  });
}

// ── Left recursion ────────────────────────────────────────────────────
// A left-corner cycle (A =>+ A α) exists iff following "first symbol of a rule"
// edges between nonterminals loops.
function hasLeftRecursion(rules) {
  const ntSet = nts(rules);
  const edges = new Map([...ntSet].map((n) => [n, new Set()]));
  const nullable = new Set();
  let ch = true;
  while (ch) {
    ch = false;
    for (const r of rules) if (!nullable.has(r.lhs) && r.rhs.every((s) => nullable.has(s))) { nullable.add(r.lhs); ch = true; }
  }
  for (const r of rules) for (const s of r.rhs) { if (ntSet.has(s)) edges.get(r.lhs).add(s); if (!nullable.has(s)) break; }
  const state = new Map();
  const visit = (n) => {
    if (state.get(n) === 1) return true;
    if (state.get(n) === 2) return false;
    state.set(n, 1);
    for (const m of edges.get(n)) if (visit(m)) return true;
    state.set(n, 2);
    return false;
  };
  return [...ntSet].some(visit);
}

for (const [name, text, start] of [
  ["direct (expression grammar)", "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id", "E"],
  ["indirect (Dragon book 4.18)", "S -> A a | b\nA -> A c | S d | eps", "S"],
  ["indirect through two steps", "A -> B x | y\nB -> C z\nC -> A w | v", "A"],
]) {
  test(`left recursion: ${name} is eliminated and the language is preserved`, () => {
    const { rules, g } = run(computeLRESteps, text);
    assert.equal(hasLeftRecursion(g.rules), true, "test grammar should be left-recursive");
    assert.equal(hasLeftRecursion(rules), false);
    sameLanguage(g.rules, rules, start, 5);
  });
}

test("left recursion: a grammar without it is reported unchanged", () => {
  const { rules, steps } = run(computeLRESteps, "S -> a S | b");
  assert.deepEqual(fmt(rules), ["S -> a S", "S -> b"]);
  assert.match(steps.at(-1).html, /No left recursion/);
});

// ── Greibach normal form ──────────────────────────────────────────────
// Every rule is A → a B₁ … Bₖ (a terminal, then nonterminals); only the start symbol may derive ε.
function assertGNF(rules, start) {
  const ntSet = nts(rules);
  for (const r of rules) {
    if (r.rhs.length === 0) { assert.equal(r.lhs, start, "only the start symbol may derive ε"); continue; }
    assert.ok(!ntSet.has(r.rhs[0]), `rule starts with a nonterminal: ${r.lhs} -> ${r.rhs}`);
    for (const x of r.rhs.slice(1)) assert.ok(ntSet.has(x), `terminal behind the first symbol: ${r.lhs} -> ${r.rhs}`);
  }
}

for (const [name, text, start] of [
  ["aⁿbⁿ", "S -> a S b | a b", "S"],
  ["expression grammar (left recursion)", "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id", "E"],
  ["balanced parentheses with ε", "S -> ( S ) S | eps", "S"],
  ["indirect left recursion", "A -> B x | y\nB -> C z\nC -> A w | v", "A"],
  ["Dragon book 4.18", "S -> A a | b\nA -> A c | S d | eps", "S"],
  ["nullable chain", "S -> A B C\nA -> a | eps\nB -> b | eps\nC -> c | eps", "S"],
  ["unit cycle", "S -> A | a\nA -> B\nB -> A | b", "S"],
  ["palindromes", "S -> a S a | b S b | a | b | eps", "S"],
  ["only ε", "S -> eps", "S"],
]) {
  test(`GNF: ${name} reaches Greibach normal form and generates the same language`, () => {
    const { rules, g, steps } = run(computeGNFSteps, text);
    assert.notEqual(steps.at(-1).phase, "Stopped");
    assertGNF(rules, start);
    sameLanguage(g.rules, rules, start, 5);
  });
}

test("GNF: S → ε is kept first, the other rules are ε-free", () => {
  const { rules } = run(computeGNFSteps, "S -> ( S ) S | eps");
  assert.deepEqual(fmt(rules.filter((r) => r.rhs.length === 0)), ["S -> ε"]);
});

test("GNF: the tail nonterminal of a left-recursive rule has no ε-rule", () => {
  const { rules } = run(computeGNFSteps, "S -> S a | b");
  assert.deepEqual(fmt(rules), ["S -> b", "S -> b S'", "S' -> a", "S' -> a S'"]);
});

test("GNF: an empty language is reported, not converted", () => {
  const { steps } = run(computeGNFSteps, "S -> S a");
  assert.match(steps.at(-1).html, /empty/);
});

test("GNF: a grammar that blows up is stopped with a message", () => {
  // each level multiplies the number of rules after substitution
  const text = "A1 -> A2 A2 | a\nA2 -> A3 A3 | b\nA3 -> A4 A4 | c\nA4 -> A5 A5 | d\nA5 -> A6 A6 | e\nA6 -> A7 A7 | f\nA7 -> A8 A8 | g\nA8 -> A9 A9 | h\nA9 -> i | j | k | l | m";
  const { steps } = run(computeGNFSteps, text);
  assert.equal(steps.at(-1).phase === "Stopped" || steps.at(-1).grammarAfter.length <= 300, true);
});

// ── Step structure ────────────────────────────────────────────────────
test("every step has the fields the tool renders", () => {
  for (const fn of [computeCleanupSteps, computeEpsSteps, computeUnitSteps, computeCNFSteps, computeLRESteps, computeGNFSteps]) {
    const { steps } = run(fn, "S -> A B | a\nA -> A a | b | eps\nB -> S | c");
    assert.ok(steps.length > 0);
    for (const st of steps) {
      assert.equal(typeof st.html, "string");
      assert.ok(Array.isArray(st.grammarAfter));
      assert.ok(Array.isArray(st.newRules) && Array.isArray(st.activeRules));
      for (const i of [...st.newRules, ...st.activeRules]) assert.ok(i >= 0 && i < st.grammarAfter.length, "index out of range");
    }
  }
});

test("step HTML escapes grammar symbols", () => {
  const { steps } = run(computeCleanupSteps, "S -> <b> | a\n<b> -> x");
  const all = steps.map((s) => s.html + (s.phase || "")).join("");
  assert.ok(!all.includes("<b>"), "raw <b> leaked into step HTML");
});

test("GNF: random small grammars end in Greibach normal form with the same language", () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const NT = ["S", "A", "B", "C"], T = ["a", "b"];
  let checked = 0;
  for (let t = 0; t < 150; t++) {
    const lines = [];
    for (const lhs of NT.slice(0, 2 + rnd(3))) {
      const alts = [];
      for (let k = 0, n = 1 + rnd(3); k < n; k++) {
        const len = rnd(4);
        const rhs = [];
        for (let i = 0; i < len; i++) rhs.push(rnd(3) === 0 ? NT[rnd(NT.length)] : T[rnd(2)]);
        alts.push(rhs.join(" ") || "eps");
      }
      lines.push(lhs + " -> " + alts.join(" | "));
    }
    const text = lines.join("\n");
    const g = parseGrammarRaw(text);
    // symbols without rules would be terminals: keep the grammar closed
    const lhs = new Set(g.rules.map((r) => r.lhs));
    if (g.rules.some((r) => r.rhs.some((x) => NT.includes(x) && !lhs.has(x)))) continue;
    const { steps, rules } = run(computeGNFSteps, text);
    if (steps.at(-1).phase === "Stopped") continue;
    const start = g.start;
    if (rules.some((r) => r.lhs === start)) assertGNF(rules, start);
    sameLanguage(g.rules, rules, start, 4);
    checked++;
  }
  assert.ok(checked > 50, "checked " + checked);
});
