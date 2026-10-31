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

// ── Numbers, per-cell conflicts, the LL(1) check and the reasons ─────────

test("a cell with three productions is one conflict", () => {
  const { conflicts } = ll1("S -> a | a b | a c");
  assert.equal(conflicts.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(conflicts[0].rules)), [0, 1, 2]);
});

test("conflict explanations number productions from 1, as the tables do", () => {
  const { ll1ExplainConflict } = load("grammar.js", "ll1.js");
  const g = parseBNF("S -> a | a b", false);
  const first = computeFirst(g);
  const { conflicts } = buildLL1Table(g, first, computeFollow(g, first));
  const ex = ll1ExplainConflict(g, first, conflicts[0]);
  assert.match(ex.text, /Productions 1 and 2 both begin with a/);
  assert.match(ex.text, /1 \(S → a\) and 2 \(S → a b\)/);
  assert.match(ex.hint, /may resolve/);
});

test("conflict kinds: both alternatives nullable, indirect left recursion", () => {
  const { ll1ExplainConflict } = load("grammar.js", "ll1.js");
  const explain = (text) => { const g = parseBNF(text, false); const f = computeFirst(g); const t = buildLL1Table(g, f, computeFollow(g, f)); return t.conflicts.map((c) => ll1ExplainConflict(g, f, c)); };
  const both = explain("S -> A | B\nA -> eps\nB -> eps | b");
  assert.equal(both[0].kind, "nullable");
  assert.match(both[0].text, /can both derive ε/);
  const indirect = explain("A -> B a | c\nB -> A b | c");
  assert.equal(indirect.some((x) => x.kind === "left-recursion" && /through other nonterminals/.test(x.text)), true);
});

test("the expand step lists the productions of a conflicting cell", () => {
  const { g, table } = ll1("E -> E + id | id");
  const act = ll1Step(g, table, ["$", "E"], ["id", "$"], 0);
  assert.equal(act.type, "expand");
  assert.deepEqual(JSON.parse(JSON.stringify(act.conflict)), [0, 1]);
  assert.equal(ll1Step(...(() => { const x = ll1("S -> a"); return [x.g, x.table, ["$", "S"], ["a", "$"], 0]; })()).conflict, null);
});

test("ll1Check names the FIRST/FIRST and FIRST/FOLLOW overlaps per nonterminal", () => {
  const { ll1Check } = load("grammar.js", "ll1.js");
  const check = (text) => { const g = parseBNF(text, false); const f = computeFirst(g); return JSON.parse(JSON.stringify(ll1Check(g, f, computeFollow(g, f, f)))); };
  const ok = check(EXPR);
  assert.equal(ok.every((c) => c.ok), true);
  const ff = check("S -> a | a b");
  assert.deepEqual(ff[0].issues, [{ kind: "first-first", a: 1, b: 2, tokens: ["a"] }]);
  const fo = check("S -> A a\nA -> a | eps");
  assert.deepEqual(fo.find((c) => c.nt === "A").issues, [{ kind: "first-follow", a: 2, b: 3, tokens: ["a"] }]);
  const nn = check("S -> A | B\nA -> eps\nB -> eps | b");
  assert.equal(nn.find((c) => c.nt === "B").ok, true);
  assert.equal(nn.find((c) => c.nt === "S").issues.some((i) => i.kind === "both-nullable"), true);
});

test("ll1Why gives a true reason for every member of FIRST and FOLLOW", () => {
  const { ll1Why } = load("grammar.js", "ll1.js");
  for (const text of [EXPR, "S -> A B c\nA -> a | eps\nB -> b | eps", "S -> a S b | eps", "E -> T E'\nE' -> + T E' | eps\nT -> id"]) {
    const g = parseBNF(text, false), f = computeFirst(g), fo = computeFollow(g, f);
    const why = ll1Why(g, f, fo);
    for (const nt of g.nonterminals) {
      for (const t of f[nt]) assert.equal(typeof why.first[nt][t], "string", `FIRST(${nt}) ∋ ${t} in ${text}`);
      for (const t of fo[nt]) assert.equal(typeof why.follow[nt][t], "string", `FOLLOW(${nt}) ∋ ${t} in ${text}`);
    }
  }
  const g = parseBNF("S -> A c\nA -> a | eps", false), f = computeFirst(g), fo = computeFollow(g, f);
  assert.match(ll1Why(g, f, fo).follow.A.c, /production 1 \(S → A c\)/);
  assert.match(ll1Why(g, f, fo).first.A.ε, /production 3/);
});
