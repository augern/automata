// Every shipped example must load and run through its tool's algorithms.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load.js");

const A = load("grammar.js", "lr.js", "ll1.js", "nfa.js", "pda.js", "tm.js", "regex.js", "rewrite.js", "derivation.js");

function examples(name) {
  const file = path.join(__dirname, "..", "examples", `examples-${name}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = [];
  for (const g of data.groups) for (const ex of g.examples) out.push({ group: g.label, ...ex });
  assert.ok(out.length > 0, name);
  return out;
}
const textOf = (ex) => (Array.isArray(ex.text) ? ex.text.join("\n") : ex.text);

test("example files are well-formed (unique labels, group labels present)", () => {
  for (const f of fs.readdirSync(path.join(__dirname, "..", "examples"))) {
    const name = f.replace(/^examples-|\.json$/g, "");
    const exs = examples(name);
    const labels = exs.map((e) => e.label);
    assert.equal(new Set(labels).size, labels.length, `${f}: duplicate labels`);
    for (const e of exs) assert.ok(e.label && e.group, `${f}: missing label/group`);
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

test("grammar-rewrite examples run through all five transformations", () => {
  for (const ex of examples("grammar-rewrite")) {
    const g = A.parseGrammarRaw(textOf(ex));
    for (const fn of [A.computeCleanupSteps, A.computeEpsSteps, A.computeUnitSteps, A.computeCNFSteps, A.computeLRESteps]) {
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

test("TM examples: sample strings halt within the step limit", () => {
  for (const ex of examples("tm")) {
    const tm = { states: ex.states, start: ex.states.indexOf(ex.start), accept: ex.states.indexOf(ex.accept), reject: ex.states.indexOf(ex.reject), trans: ex.trans };
    for (const s of ex.strings || []) {
      const res = A.tmRun(tm, s);
      assert.notEqual(res.outcome, "limit", `${ex.label} did not halt on "${s}"`);
    }
  }
});
