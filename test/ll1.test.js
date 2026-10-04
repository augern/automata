const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { parseBNF, computeFirst, computeFollow, EPSILON, buildLL1Table, ll1Step } = load("grammar.js", "ll1.js");

function ll1(text) {
  const g = parseBNF(text, false);
  const first = computeFirst(g);
  const follow = computeFollow(g, first);
  return { g, ...buildLL1Table(g, first, follow) };
}

// Drive ll1Step to completion; returns { accepted, steps }.
function parse(g, table, input) {
  const tokens = [...(input.trim() ? input.trim().split(/\s+/) : []), "$"];
  const stack = ["$", g.start];
  let pos = 0;
  const steps = [];
  for (let n = 0; n < 1000; n++) {
    const act = ll1Step(g, table, stack, tokens, pos);
    steps.push(act.type);
    if (act.type === "accept") return { accepted: true, steps };
    if (act.type === "error") return { accepted: false, steps, error: act };
    stack.pop();
    if (act.type === "match") pos++;
    else for (const s of [...act.rule.rhs].reverse()) if (s !== EPSILON) stack.push(s);
  }
  throw new Error("parser did not terminate");
}

const EXPR = `E -> T E'
E' -> + T E' | eps
T -> F T'
T' -> * F T' | eps
F -> ( E ) | id`;

test("dragon-book LL(1) expression grammar has no conflicts and the textbook table", () => {
  const { table, conflicts, g } = ll1(EXPR);
  assert.equal(conflicts.length, 0);
  const rule = (nt, t) => {
    const r = g.rules[table[nt][t]];
    return r.lhs + " -> " + (r.rhs.join(" ") || "eps");
  };
  assert.equal(rule("E", "id"), "E -> T E'");
  assert.equal(rule("E", "("), "E -> T E'");
  assert.equal(rule("E'", "+"), "E' -> + T E'");
  assert.equal(rule("E'", ")"), "E' -> eps");
  assert.equal(rule("E'", "$"), "E' -> eps");
  assert.equal(rule("T'", "*"), "T' -> * F T'");
  assert.equal(rule("T'", "+"), "T' -> eps");
  assert.equal(table.E["+"], undefined);
});

test("left-recursive and non-left-factored grammars produce conflicts", () => {
  assert.ok(ll1("E -> E + T | T\nT -> id").conflicts.length > 0);
  const lf = ll1("S -> a S | a");
  assert.equal(lf.conflicts.length, 1);
  assert.equal(lf.conflicts[0].nt, "S");
  assert.equal(lf.conflicts[0].sym, "a");
});

test("accepts and rejects strings", () => {
  const { g, table } = ll1(EXPR);
  assert.ok(parse(g, table, "id + id * id").accepted);
  assert.ok(parse(g, table, "( id + id ) * id").accepted);
  const bad = parse(g, table, "id + * id");
  assert.equal(bad.accepted, false);
  assert.equal(bad.error.reason, "no-rule");
  assert.equal(bad.error.token, "*");
});

test("mismatching terminal is reported", () => {
  const { g, table } = ll1("S -> a b");
  const r = parse(g, table, "a a");
  assert.equal(r.accepted, false);
  assert.equal(r.error.reason, "mismatch");
  assert.equal(r.error.expected, "b");
});

test("epsilon-only language", () => {
  const { g, table } = ll1("S -> eps");
  assert.ok(parse(g, table, "").accepted);
  assert.equal(parse(g, table, "a").accepted, false);
});

// ── ll1ExplainConflict ─────────────────────────────────────────────────
(function () {
  const { parseBNF, computeFirst, computeFollow } = load("grammar.js");
  const { buildLL1Table, ll1ExplainConflict } = load("grammar.js", "ll1.js");
  const explain = (text) => {
    const g = parseBNF(text);
    const first = computeFirst(g), follow = computeFollow(g, first);
    const { conflicts } = buildLL1Table(g, first, follow);
    return { conflicts, ex: conflicts.map((c) => ll1ExplainConflict(g, first, c)) };
  };
  test("ll1ExplainConflict names left recursion and points to the rewriting tool", () => {
    const { ex } = explain("E -> E + T | T\nT -> id");
    assert.ok(ex.length > 0);
    assert.equal(ex[0].kind, "left-recursion");
    assert.equal(ex[0].tool, "grammar-rewrite");
    assert.match(ex[0].text, /left recursive/);
  });
  test("ll1ExplainConflict recognises a common prefix and an ε/FOLLOW clash", () => {
    assert.equal(explain("S -> a b | a c").ex[0].kind, "common-prefix");
    assert.equal(explain("S -> A a\nA -> a | eps").ex[0].kind, "nullable");
  });
})();
