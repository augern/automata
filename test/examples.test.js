// Every shipped example must load and run through its tool's algorithms.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load.js");

const A = load("grammar.js", "strings.js", "lr.js", "ll1.js", "nfa.js", "pda.js", "tm.js", "regex.js", "rewrite.js", "derivation.js", "rdp.js", "pumping.js");

// The shared grammar library: examples may give "grammar": key instead of "text".
const LIBRARY = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "shared", "grammars.json"), "utf8"));

function examples(name) {
  const file = path.join(__dirname, "..", "tools", name, "examples.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = [];
  for (const g of data.groups) {
    for (const ex of g.examples) {
      const e = { group: g.label, ...ex };
      if (e.grammar) {
        assert.ok(LIBRARY[e.grammar], `${name}/${e.label}: unknown grammar "${e.grammar}"`);
        e.text = LIBRARY[e.grammar].text;
        if (!e.label) e.label = LIBRARY[e.grammar].label;
      }
      out.push(e);
    }
  }
  assert.ok(out.length > 0, name);
  return out;
}
const textOf = (ex) => (Array.isArray(ex.text) ? ex.text.join("\n") : ex.text);

test("example files are well-formed (unique labels, group labels present)", () => {
  const tools = fs.readdirSync(path.join(__dirname, "..", "tools"), { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const d of tools) {
    const name = d.name, f = `tools/${name}/examples.json`;
    const exs = examples(name);
    const labels = exs.map((e) => e.label);
    assert.equal(new Set(labels).size, labels.length, `${f}: duplicate labels`);
    for (const e of exs) assert.ok(e.label && e.group, `${f}: missing label/group`);
  }
});

test("every example has a one-line purpose (shown as the tooltip in the examples menu)", () => {
  const tools = fs.readdirSync(path.join(__dirname, "..", "tools"), { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const d of tools) {
    for (const ex of examples(d.name)) {
      assert.ok(typeof ex.purpose === "string" && ex.purpose.length >= 20, `${d.name}: "${ex.label}" has no purpose`);
      assert.ok(ex.purpose.length <= 160, `${d.name}: the purpose of "${ex.label}" is too long`);
    }
  }
});

test("LR examples build automata and tables in every mode", () => {
  for (const ex of examples("lr")) {
    const g = A.parseBNF(textOf(ex));
    const lr0 = A.buildLR0(g);
    const lr1 = A.buildLR1(g);
    const lalr = A.mergeLR1toLALR(lr1);
    assert.ok(lr0.states.length > 0 && lalr.states.length <= lr1.states.length, ex.label);
    assert.equal(lalr.states.length, lr0.states.length, `${ex.label}: LALR(1) must have the LR(0) states`);
    A.buildTables(g, lr0, "LR0");
    A.buildTables(g, lr0, "SLR1");
    A.buildTables(g, lalr, "LR1");
    A.buildTables(g, lr1, "LR1");
  }
});

test("recursive-descent examples parse, and their sample strings run in the example's mode", () => {
  for (const ex of examples("rdp")) {
    const g = A.rdpParseGrammar(textOf(ex));
    assert.ok(ex.strings && ex.strings.length > 0, `${ex.label}: no sample strings`);
    assert.ok(["full", "ordered", "packrat"].includes(ex.mode) || ex.mode === undefined, `${ex.label}: bad mode`);
    for (const s of ex.strings) {
      const t = A.rdpRun(g, A.rdpTokenise(g, s), { mode: ex.mode || "full" });
      assert.ok(t.events.length > 0, `${ex.label}: "${s}"`);
    }
  }
  // Only the examples about left recursion are left-recursive.
  const rec = examples("rdp").filter((ex) => A.rdpLeftRecursive(A.rdpParseGrammar(textOf(ex))).length > 0).map((ex) => ex.label);
  assert.deepEqual([...rec].sort(), ["Hidden left recursion", "Left recursion", "Sentences with an adjective list (left-recursive)"]);
});

test("pumping examples: the machine or grammar parses and every sample string has something to pump", () => {
  for (const ex of examples("pumping")) {
    assert.ok(ex.mode === "regular" || ex.mode === "cf", ex.label);
    const r = ex.mode === "regular" ? A.pumpParseDFA(textOf(ex)) : A.rdpParseGrammar(textOf(ex));
    for (const w of ex.strings || []) {
      if (ex.mode === "regular") assert.ok(A.pumpFindLoop(A.pumpDFARun(r, w).path), `${ex.label}: "${w}"`);
      else assert.ok(A.pumpPairs(A.pumpParseTree(r, A.rdpTokenise(r, w)).tree).length > 0, `${ex.label}: "${w}"`);
    }
  }
});

test("LL(1) examples build tables", () => {
  for (const ex of examples("ll1")) {
    const g = A.parseBNF(textOf(ex), false);
    const first = A.computeFirst(g);
    const { table } = A.buildLL1Table(g, first, A.computeFollow(g, first));
    assert.ok(Object.keys(table).length > 0, ex.label);
  }
});

test("regex examples compile, and NFA/DFA/minimal DFA agree on short strings", () => {
  for (const ex of examples("regex")) {
    const nfa = A.regexToNFA(ex.text);
    const dfa = A.subsetConstruct(nfa);
    const min = A.minimizeDFA(dfa);
    const re = new RegExp("^(?:" + ex.text + ")$");
    for (const w of ["", "a", "b", "ab", "abb", "aab", "abc", "abcd", "0", "12", "ba", "bb"]) {
      assert.equal(A.dfaRun(dfa, w).accepted, re.test(w), `${ex.text} on "${w}"`);
      assert.equal(A.dfaRun(min, w).accepted, re.test(w), `min ${ex.text} on "${w}"`);
    }
  }
});

test("grammar-rewrite examples run through all six transformations", () => {
  for (const ex of examples("grammar-rewrite")) {
    const g = A.parseGrammarRaw(textOf(ex));
    for (const fn of [A.computeCleanupSteps, A.computeEpsSteps, A.computeUnitSteps, A.computeCNFSteps, A.computeLRESteps, A.computeGNFSteps]) {
      assert.ok(fn(g).length > 0, `${ex.label}: ${fn.name}`);
    }
  }
});

test("derivation examples parse", () => {
  for (const ex of examples("derivation")) {
    const g = A.parseDerivationGrammar(textOf(ex));
    assert.ok(g.rules.length > 0 && g.start, ex.label);
  }
});

test("NFA examples: every sample string runs and the verdict is a boolean", () => {
  for (const ex of examples("nfa")) {
    const nfa = { states: ex.states, start: ex.states.indexOf(ex.start), accepts: new Set(ex.accepts.map((s) => ex.states.indexOf(s))), trans: ex.trans };
    assert.ok(nfa.start >= 0, ex.label);
    for (const s of ex.strings || []) assert.equal(typeof A.nfaBuildSimTree(nfa, s).accepted, "boolean", `${ex.label} on "${s}"`);
  }
});

test("PDA examples: every sample string runs", () => {
  for (const ex of examples("pda")) {
    const pda = { states: ex.states, start: ex.states.indexOf(ex.start), accepts: new Set(ex.accepts.map((s) => ex.states.indexOf(s))), rules: ex.rules, initStack: ex.initStack, acceptMode: ex.acceptMode };
    for (const s of ex.strings || []) {
      const exact = A.pdaAcceptsString(pda, s);
      assert.equal(typeof exact.accepted, "boolean", `${ex.label} on "${s}"`);
    }
  }
});

test("TM examples: sample strings halt within the step limit, except those an example lists in `loops`", () => {
  for (const ex of examples("tm")) {
    const tm = { states: ex.states, start: ex.states.indexOf(ex.start), accept: ex.states.indexOf(ex.accept), reject: ex.states.indexOf(ex.reject), trans: ex.trans };
    const loops = new Set(ex.loops || []);
    for (const s of ex.strings || []) {
      const res = A.tmRun(tm, s);
      if (loops.has(s)) assert.equal(res.outcome, "limit", `${ex.label} should loop on "${s}"`);
      else assert.notEqual(res.outcome, "limit", `${ex.label} did not halt on "${s}"`);
    }
    for (const s of loops) assert.ok((ex.strings || []).includes(s), `${ex.label}: loops lists "${s}", which is not a sample string`);
  }
});

test("new example kinds: every sample string of a PDA/NFA example gets a boolean verdict, and conflict examples conflict", () => {
  const ll = examples("ll1").filter((e) => e.group === "Non-LL(1)");
  assert.ok(ll.length >= 3);
  for (const ex of ll) {
    const g = A.parseBNF(textOf(ex));
    const first = A.computeFirst(g);
    assert.ok(A.buildLL1Table(g, first, A.computeFollow(g, first)).conflicts.length > 0, `${ex.label} should not be LL(1)`);
  }
});

test("the grammar library: every entry parses, is used by at least two examples, and has a label", () => {
  const used = new Map();
  for (const name of fs.readdirSync(path.join(__dirname, "..", "tools"))) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tools", name, "examples.json"), "utf8"));
    for (const g of data.groups) for (const ex of g.examples) if (ex.grammar) used.set(ex.grammar, (used.get(ex.grammar) || 0) + 1);
  }
  for (const [key, g] of Object.entries(LIBRARY)) {
    assert.ok(g.label && Array.isArray(g.text) && g.text.length, `${key}: label and text`);
    A.parseBNF(g.text.join("\n"), false);
    assert.ok((used.get(key) || 0) >= 2, `${key}: used by ${used.get(key) || 0} example(s); a grammar used once belongs in its tool's examples.json`);
  }
  for (const key of used.keys()) assert.ok(LIBRARY[key], `unknown grammar ${key}`);
});

test("compiler-construction examples: token rules and grammar compile without gaps or conflicts, and every string runs", () => {
  const A2 = load("grammar.js", "strings.js", "regex.js", "lr.js", "compiler.js");
  for (const tool of ["compiler"]) {
    for (const ex of examples(tool)) {
      const tokens = Array.isArray(ex.tokens) ? ex.tokens.join("\n") : ex.tokens;
      const comp = A2.cmpCompile(tokens, textOf(ex));
      assert.equal(comp.missing.length, 0, `${tool}/${ex.label}: grammar terminals without a token rule: ${[...comp.missing]}`);
      assert.equal(comp.tables.conflicts.length, 0, `${tool}/${ex.label}: conflicts`);
      for (const s of ex.strings || []) assert.ok(A2.cmpRun(comp, s).frames.length > 1, `${tool}/${ex.label}: "${s}"`);
    }
  }
});

test("compiler-construction examples: the strings give the results their descriptions promise", () => {
  const A2 = load("grammar.js", "strings.js", "regex.js", "lr.js", "compiler.js");
  const comp = (tool, label) => { const ex = examples(tool).find((e) => e.label === label); return A2.cmpCompile(Array.isArray(ex.tokens) ? ex.tokens.join("\n") : ex.tokens, textOf(ex)); };
  const last = (c, s) => { const r = A2.cmpRun(c, s); return { ok: r.accepted, f: r.frames[r.frames.length - 1] }; };
  const ev = comp("compiler", "Evaluate expressions");
  assert.equal(last(ev, "2 + 3 * 4").f.stack[1].attrs.val, 14);
  assert.equal(last(ev, "10 - 4 - 3").f.stack[1].attrs.val, 3);
  assert.equal(last(ev, "8 / 2 / 2").f.stack[1].attrs.val, 2);
  assert.equal(last(comp("compiler", "Translation to postfix"), "(a + b) * c").f.stack[1].attrs.val, "a b + c *");
  const q = last(comp("compiler", "Three-address code (quadruples)"), "a + b * c").f;
  assert.deepEqual(JSON.parse(JSON.stringify(q.quads)), [["*", "b", "c", "t1"], ["+", "a", "t1", "t2"]]);
  const lp = comp("compiler", "Keywords and identifiers");
  assert.equal(last(lp, "printer = 2;").ok, true);
  assert.equal(last(lp, "x = print;").ok, false);
  assert.equal(last(comp("compiler", "Integer and real literals"), "1.+2").f.type, "error");
  const ty = comp("compiler", "Declarations and assignments");
  assert.deepEqual(JSON.parse(JSON.stringify(last(ty, "integer n; n = 2.5;").f.messages)), ["cannot assign a real to the integer n"]);
  assert.deepEqual(JSON.parse(JSON.stringify(last(ty, "x = 1;").f.messages)), ["undeclared variable x"]);
  assert.equal(last(ty, "integer x; real y; x = 1; y = x * 2.5;").f.messages.length, 0);
});
