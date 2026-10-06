const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const L = load("grammar.js", "rdp.js");
const { rdpParseGrammar, rdpTokenise, rdpLeftRecursive, rdpRun, rdpStateAt, rdpProcedures, rdpPendingLines, rdpExplainNode } = L;
const arr = (x) => [...x];

const run = (src, input, mode = "full", opts) => {
  const g = rdpParseGrammar(src);
  return { g, t: rdpRun(g, rdpTokenise(g, input), { mode, ...opts }) };
};
const final = (t) => rdpStateAt(t, t.events.length - 1);
// The terminals that are still matched at the end, in order.
const leaves = (t) => {
  const st = final(t).status;
  return t.nodes.filter((nd) => nd.kind === "tok" && !nd.eps && st[nd.id] && st[nd.id].st === "ok").map((nd) => nd.sym);
};

const ANBN = "S -> a S b | eps";

test("grammar: alternatives keep their written order, procedures in order of appearance", () => {
  const g = rdpParseGrammar("S -> A b | c\nA -> a | a a");
  assert.deepEqual(arr(g.order), ["S", "A"]);
  assert.deepEqual(arr(g.alts.A.map((a) => a.rhs.join(" "))), ["a", "a a"]);
  assert.equal(g.start, "S");
  assert.deepEqual([...g.terminals].sort(), ["a", "b", "c"]);
  assert.throws(() => rdpParseGrammar("A B -> a"), /single nonterminal/);
});

test("tokenise: whitespace, or greedy cutting at the terminals", () => {
  const g = rdpParseGrammar("E -> id + id");
  assert.deepEqual(arr(rdpTokenise(g, "id + id")), ["id", "+", "id"]);
  assert.deepEqual(arr(rdpTokenise(g, "id+id")), ["id", "+", "id"]);
  assert.deepEqual(arr(rdpTokenise(g, "  ")), []);
  assert.deepEqual(arr(rdpTokenise(rdpParseGrammar(ANBN), "aabb")), ["a", "a", "b", "b"]);
});

test("left recursion is found directly, indirectly and through a nullable prefix", () => {
  assert.deepEqual(arr(rdpLeftRecursive(rdpParseGrammar("E -> E + T | T\nT -> id"))), ["E"]);
  assert.deepEqual(arr(rdpLeftRecursive(rdpParseGrammar("A -> B a | c\nB -> A b"))), ["A", "B"]);
  assert.deepEqual(arr(rdpLeftRecursive(rdpParseGrammar("S -> N S a | b\nN -> eps"))), ["S"]);
  assert.deepEqual(arr(rdpLeftRecursive(rdpParseGrammar(ANBN))), []);
});

for (const mode of ["full", "ordered"]) {
  test(`${mode}: aⁿbⁿ is accepted, a prefix is not`, () => {
    const ok = run(ANBN, "aabb", mode).t;
    assert.equal(ok.accepted, true);
    assert.deepEqual(arr(leaves(ok)), ["a", "a", "b", "b"]);
    assert.equal(final(ok).event.kind, "accept");
    assert.equal(run(ANBN, "aab", mode).t.accepted, false);
    assert.equal(run(ANBN, "", mode).t.accepted, true);
  });
}

test("ordered choice commits and rejects what complete backtracking accepts", () => {
  const src = "S -> A b\nA -> a | a a";
  assert.equal(run(src, "aab", "full").t.accepted, true);
  assert.equal(run(src, "aab", "ordered").t.accepted, false);
  assert.equal(run(src, "ab", "ordered").t.accepted, true);
});

test("ordered choice: a leftover prefix is reported, not accepted", () => {
  const t = run("S -> a", "a a", "ordered").t;
  assert.equal(t.accepted, false);
  assert.equal(final(t).event.kind, "leftover");
  const f = run("S -> a", "a a", "full").t;
  assert.equal(f.accepted, false);
  assert.equal(f.events.some((e) => e.kind === "leftover"), true);
});

test("backtracking: the cursor jumps back and abandoned attempts become dead", () => {
  const { t } = run("S -> A b\nA -> a | a a", "aab", "full");
  const positions = t.events.map((e) => e.pos);
  assert.ok(positions.some((p, i) => i && p < positions[i - 1]), "position goes down at some step");
  const st = final(t).status;
  assert.ok(t.nodes.some((nd) => st[nd.id] && st[nd.id].st === "dead"));
  assert.deepEqual(arr(leaves(t)), ["a", "a", "b"]);
  assert.equal(final(t).backtracks > 0, true);
});

test("a nullable symbol called again at the same position is not left recursion", () => {
  const { t } = run("S -> A A b\nA -> eps | a", "b", "full");
  assert.equal(t.aborted, null);
  assert.equal(t.accepted, true);
});

test("left recursion stops the run at once, in both modes", () => {
  for (const mode of ["full", "ordered"]) {
    const { t } = run("E -> E + T | T\nT -> id", "id + id", mode);
    assert.equal(t.aborted, "left-recursion");
    assert.equal(t.accepted, false);
    assert.equal(t.events[t.events.length - 1].kind, "loop");
  }
});

test("an exponential search is cut off", () => {
  const { t } = run("S -> a S | a S | b", "a a a a a a a a a a a a a a a", "full", { maxEvents: 200 });
  assert.equal(t.aborted, "limit");
  assert.equal(t.events.length <= 200, true);
  assert.equal(t.events[t.events.length - 1].kind, "limit");
});

test("every event's code line exists in the generated procedures", () => {
  for (const mode of ["full", "ordered"]) {
    for (const [src, input] of [[ANBN, "aab"], ["S -> A b | c\nA -> a | a a | eps", "aab"], ["E -> T E'\nE' -> + T E' | eps\nT -> id", "id + id"]]) {
      const { g, t } = run(src, input, mode);
      const keys = new Set(rdpProcedures(g, mode).flatMap((p) => p.lines.map((l) => l.key)));
      for (const e of t.events) if (e.line) assert.ok(keys.has(e.line), `${mode}: ${JSON.stringify(e.line)}`);
      for (const nd of t.nodes) if (nd.site) assert.ok(keys.has(nd.site), `${mode}: site ${JSON.stringify(nd.site)}`);
    }
  }
});

test("procedures: one line per symbol, nested loops in complete mode, flat steps in ordered mode", () => {
  const g = rdpParseGrammar("S -> a S b | eps");
  const full = rdpProcedures(g, "full")[0].lines;
  const ord = rdpProcedures(g, "ordered")[0].lines;
  const text = (l) => l.segs.map((s) => s[1]).join("");
  assert.match(text(full[0]), /yields each j/);
  const forLines = full.filter((l) => /^for /.test(text(l)));
  assert.deepEqual(arr(forLines.map((l) => l.indent)), [2, 3, 4]);
  assert.ok(ord.some((l) => /^j₂ ← S\(j₁\)/.test(text(l))));
  assert.ok(ord.some((l) => text(l) === "return ✗  ▷ no alternative matched"));
});

test("state: statuses follow the events; the tree at the end holds the parse", () => {
  const { t } = run(ANBN, "ab", "full");
  const first = rdpStateAt(t, 0);
  assert.equal(first.status[0].st, "open");
  assert.equal(first.pos, 0);
  const end = final(t);
  assert.equal(end.status[0].st, "ok");
  assert.equal(end.status[0].end, 2);
  assert.equal(end.calls, t.events.filter((e) => e.kind === "call").length);
});

test("pending lines are the call sites that led to the focused node", () => {
  const { t } = run(ANBN, "ab", "full");
  const idx = t.events.findIndex((e) => e.kind === "match" && e.pos === 1);
  const deepIdx = t.events.findIndex((e) => e.kind === "call" && e.depth === 2);
  assert.ok(idx >= 0 && deepIdx >= 0);
  const lines = rdpPendingLines(t, t.events[deepIdx]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^S\u0001s0\.1$/);
});

test("explain: a node says what happened to it", () => {
  const { g, t } = run("S -> A b\nA -> a | a a", "ab", "ordered");
  const st = final(t);
  const aCall = t.nodes.find((nd) => nd.kind === "call" && nd.nt === "A");
  const e = rdpExplainNode(g, t, st, aCall.id);
  assert.equal(e.role, "ok");
  assert.match(e.lines.join(" "), /final/);
  const r2 = run("S -> A b\nA -> a | a a", "aab", "ordered");
  const st2 = final(r2.t);
  const bad = r2.t.nodes.find((nd) => nd.kind === "tok" && st2.status[nd.id].st === "dead");
  assert.equal(rdpExplainNode(r2.g, r2.t, st2, bad.id).role, "dead");
  assert.equal(rdpExplainNode(g, t, st, 9999), null);
});

test("every generated line says what it is for", () => {
  const g = rdpParseGrammar("S -> a S b | eps");
  for (const mode of ["full", "ordered"]) {
    const lines = rdpProcedures(g, mode).flatMap((p) => p.lines);
    assert.ok(lines.every((l) => l.note && l.kind), mode);
    assert.deepEqual(arr(lines.map((l) => l.kind)), ["head", "alt", "sym", "sym", "sym", "yield", "alt", "yield", "end"]);
  }
});

test("rule spans line up with the parsed rules and point at the right text", () => {
  const src = "// grammar\nS -> a S b | eps\n\n  T → x  | y z";
  const g = rdpParseGrammar(src);
  const sp = L.rdpRuleSpans(src);
  assert.equal(sp.length, g.rules.length);
  const at = (r) => [src.slice(...sp[r].lhs), src.slice(...sp[r].rhs), arr(sp[r].toks.map((t) => src.slice(...t)))];
  assert.deepEqual(at(0)[0], "S");
  assert.deepEqual(at(0)[1], "a S b");
  assert.deepEqual(at(0)[2], ["a", "S", "b"]);
  assert.deepEqual(at(1)[1], "eps");
  assert.deepEqual([at(2)[0], at(2)[1]], ["T", "x"]);
  assert.deepEqual([at(3)[0], at(3)[1], at(3)[2]], ["T", "y z", ["y", "z"]]);
});

test("grammar ranges: an alternative's lines mark its production, a symbol line also the symbol", () => {
  const src = "S -> a S b | eps";
  const g = rdpParseGrammar(src);
  const sp = L.rdpRuleSpans(src);
  const txt = (ranges) => arr(ranges.map((r) => r.role + ":" + src.slice(r.from, r.to)));
  assert.deepEqual(txt(L.rdpGrammarRanges(g, sp, L.rdpKey("S", "sym", 0, 1))), ["lhs:S", "rhs:a S b", "sym:S"]);
  assert.deepEqual(txt(L.rdpGrammarRanges(g, sp, L.rdpKey("S", "alt", 1))), ["lhs:S", "rhs:eps"]);
  assert.deepEqual(txt(L.rdpGrammarRanges(g, sp, L.rdpKey("S", "sym", 0, 3))), ["lhs:S", "rhs:a S b"]); // the yield line
  assert.deepEqual(txt(L.rdpGrammarRanges(g, sp, L.rdpKey("S", "head"))), ["lhs:S", "lhs:S"]);
  assert.equal(L.rdpGrammarRanges(g, sp, "nonsense").length, 0);
});

test("frame progress: symbols before the line are done, earlier alternatives are gone", () => {
  const src = "S -> a b | c d e | f";
  const g = rdpParseGrammar(src);
  const sp = L.rdpRuleSpans(src);
  const key = L.rdpKey("S", "sym", 1, 2); // second alternative, at "e"
  const txt = (ranges) => arr(ranges.map((r) => r.role + ":" + src.slice(r.from, r.to)));
  assert.deepEqual(txt(L.rdpFrameRanges(g, sp, key)), ["done:c", "done:d", "gone:a b"]);
  const lines = L.rdpFrameLines(g, key);
  assert.deepEqual(arr(lines.done.map((k) => k.replace("\u0001", ":"))), ["S:s1.0", "S:s1.1"]);
  assert.deepEqual(arr(lines.gone.map((k) => k.replace("\u0001", ":"))), ["S:a0", "S:s0.0", "S:s0.1", "S:s0.2"]);
  // the first alternative's yield line: everything before it is done, nothing is gone
  assert.equal(L.rdpFrameRanges(g, sp, L.rdpKey("S", "sym", 0, 2)).length, 2);
  assert.equal(L.rdpFrameRanges(g, sp, L.rdpKey("S", "head")).length, 0);
  assert.equal(L.rdpFrameRanges(g, sp, L.rdpKey("S", "alt", 0)).length, 0);
  assert.deepEqual(arr(L.rdpFrameRanges(g, sp, L.rdpKey("S", "end")).map((r) => r.role)), ["gone", "gone", "gone"]);
});

test("packrat: the same verdicts as ordered choice with less work, memo hits replace repeated calls", () => {
  const src = "E -> T + E | T\nT -> id | ( E )";
  const input = "( ( ( ( id ) ) ) )";
  const plain = run(src, input, "ordered").t;
  const memo = run(src, input, "packrat").t;
  assert.equal(memo.accepted, plain.accepted);
  assert.equal(memo.mode, "ordered");
  assert.equal(memo.memo, true);
  assert.ok(memo.events.length < plain.events.length / 3, `${memo.events.length} vs ${plain.events.length}`);
  const hits = memo.events.filter((e) => e.kind === "memo");
  assert.ok(hits.length > 0);
  assert.equal(final(memo).memoHits, hits.length);
  // a hit is a leaf with the remembered result
  for (const e of hits) assert.equal(memo.nodes.filter((nd) => nd.parent === e.node).length, 0);
});

test("packrat: a remembered failure is reused too", () => {
  const { t } = run("S -> A x | A y\nA -> a", "a y", "packrat");
  assert.equal(t.accepted, true);
  assert.equal(t.events.some((e) => e.kind === "memo"), true);
});

test("packrat: random grammars give the verdict of plain ordered choice", () => {
  let seed = 777;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const NT = ["S", "A", "B"], T = ["a", "b"];
  let compared = 0;
  for (let k = 0; k < 200; k++) {
    const lines = NT.slice(0, 2 + rnd(2)).map((lhs) => lhs + " -> " + Array.from({ length: 1 + rnd(3) }, () => Array.from({ length: rnd(4) }, () => (rnd(3) === 0 ? NT[rnd(NT.length)] : T[rnd(2)])).join(" ") || "eps").join(" | "));
    const g = rdpParseGrammar(lines.join("\n"));
    if (g.rules.some((r) => r.rhs.some((x) => NT.includes(x) && !g.alts[x]))) continue;
    for (const w of ["", "a", "ab", "aab", "abba", "bab"]) {
      const a = rdpRun(g, rdpTokenise(g, w), { mode: "ordered" });
      const b = rdpRun(g, rdpTokenise(g, w), { mode: "packrat" });
      assert.equal(b.accepted, a.accepted, lines.join("; ") + " on " + w);
      assert.equal(b.aborted, a.aborted);
      compared++;
    }
  }
  assert.ok(compared > 300);
});

test("packrat procedures start with a memo lookup and store their result", () => {
  const g = rdpParseGrammar("S -> a S | b");
  const lines = rdpProcedures(g, "packrat")[0].lines;
  const text = (l) => l.segs.map((s) => s[1]).join("");
  assert.equal(lines[1].kind, "memo");
  assert.match(text(lines[1]), /memo/);
  assert.ok(lines.filter((l) => l.kind === "yield").every((l) => /^memo\(S, i\) ←/.test(text(l))));
  assert.match(text(lines.at(-1)), /^memo\(S, i\) ← ✗/);
  assert.equal(L.rdpKeyParts(L.rdpKey("S", "memo")).part, "memo");
});
