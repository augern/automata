const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load.js");

const S = load("grammar.js", "strings.js", "regex.js", "lr.js", "scanner.js", "compiler.js");
const arr = (x) => JSON.parse(JSON.stringify(x));

const KW = "skip [ \\t\\n]+ -> skip\nprint print\nid [a-z]+\nnum [0-9]+(\\.[0-9]+)?\n'=' =\n'<' <\n'<=' <=";

function lex(text, input) {
  const sc = S.scnCompile(text);
  const chars = [...input];
  const out = [];
  for (let pos = 0; pos < chars.length; ) {
    const r = S.scnScan(sc.dfa, chars, pos);
    out.push(r.rule === -1 ? "?" : sc.rules[r.rule].name + ":" + chars.slice(r.start, r.end).join(""));
    pos = r.end;
  }
  return out;
}

test("patterns: classes, negation, ., escapes, and errors", () => {
  assert.equal(S.scnPatternError("[a-z]+(\\.[0-9])?"), null);
  assert.match(S.scnPatternError("[a-"), /Unterminated/);
  assert.match(S.scnPatternError("(ab"), /Missing \)/);
  assert.match(S.scnPatternError("*a"), /Nothing before/);
  assert.match(S.scnPatternError("[z-a]"), /Backwards/);
  assert.match(S.scnPatternError("a\\"), /Trailing/);
  assert.equal(S.scnSetLabel({ chars: ["a", "b", "c", "d"], neg: false }), "[a-d]");
  assert.equal(S.scnSetLabel({ chars: ["\n"], neg: true }), ".");
  assert.equal(S.scnSetLabel({ chars: ['"'], neg: true }), '[^"]');
});

test("longest match, ties go to the earlier rule, the scanner backs up", () => {
  assert.deepEqual(arr(lex(KW, "print printer = 12.5 < <= x")), ["print:print", "skip:␣".replace("␣", " "), "id:printer", "skip: ", "=:=", "skip: ", "num:12.5", "skip: ", "<:<", "skip: ", "<=:<=", "skip: ", "id:x"]);
  // "1." has no digit after the point: the number is "1", and the scanner read the "." and backed up
  const sc = S.scnCompile(KW);
  const r = S.scnScan(sc.dfa, [..."1.x"], 0);
  assert.equal(sc.rules[r.rule].name, "num");
  assert.equal(r.end, 1);
  assert.equal(r.readTo, 3); // the x, which has no transition, was looked at too
  assert.equal(r.last.end, 1);
});

test("the DFA scan agrees with the NFA scan of the compiler tool on its examples", () => {
  const ex = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tools", "compiler", "examples.json"), "utf8"));
  const inputs = ["a + 12 * (b - 3.5)", "x1+y*2", "print x + 1;", "printer = 2;", "a<=b<c", "1.+2", "integer x; real y;", "12.5.5 ab9"];
  for (const g of ex.groups) for (const e of g.examples) {
    const text = e.tokens.join("\n");
    const sc = S.scnCompile(text), old = S.cmpBuildScanner(S.cmpParseTokenRules(text));
    for (const input of inputs.concat(e.strings || [])) {
      const chars = [...input];
      for (let pos = 0; pos < chars.length; ) {
        const a = S.scnScan(sc.dfa, chars, pos), b = S.cmpScan(old, chars, pos);
        assert.deepEqual([a.rule, a.start, a.end, a.readTo], [b.rule, b.start, b.end, b.readTo], e.label + ": " + JSON.stringify(input) + " at " + pos);
        pos = b.end;
      }
    }
  }
});

test("character classes: 26 letters are one class, and what no rule mentions is 'other'", () => {
  const sc = S.scnCompile("id [a-z][a-z0-9]*\nnum [0-9]+\nskip [ ]+ -> skip");
  const labels = sc.dfa.classes.map((c) => c.label);
  assert.deepEqual(arr(labels), ["[0-9]", "␣", "[a-z]", "other"].sort((x, y) => labels.indexOf(x) - labels.indexOf(y)));
  assert.equal(sc.dfa.classes.length, 4);
  assert.equal(sc.dfa.classOf("q"), sc.dfa.classOf("a"));
  assert.equal(sc.dfa.classOf("%"), sc.dfa.classOf("é"));
  assert.notEqual(sc.dfa.classOf("%"), sc.dfa.classOf("a"));
  assert.equal(sc.dfa.atomCount >= sc.dfa.classes.length, true);
});

test("negated classes and . use 'other'; a string literal and a comment", () => {
  const rules = 'str "[^"]*"\ncomment //.*\ndiv /\nid [a-z]+';
  assert.deepEqual(arr(lex(rules, 'say "héllo wörld" // x y z\n/')), ['id:say', '?', 'str:"héllo wörld"', '?', "comment:// x y z", "?", "div:/"]); // a space or newline matches no rule
});

test("a rule listed after one that matches the same lexemes never wins, and states that accept two rules are listed", () => {
  const late = S.scnCompile("id [a-z]+\nprint print");
  assert.deepEqual(arr(late.shadowed), [1]);
  const ok = S.scnCompile("print print\nid [a-z]+");
  assert.deepEqual(arr(ok.shadowed), []);
  assert.equal(ok.conflicts.length > 0, true);
  const st = ok.dfa.states[ok.conflicts[0]];
  assert.deepEqual(arr(st.rules), [0, 1]);
  assert.equal(st.accept, 0);
});

test("the minimal DFA keeps tokens apart and is small", () => {
  const sc = S.scnCompile("a a\nb a\n");
  assert.equal(sc.dfa.states.filter((s) => s.accept >= 0).length, 1);
  const two = S.scnCompile("x a\ny b");
  assert.equal(two.dfa.states.filter((s) => s.accept >= 0).length, 2);
  const nums = S.scnCompile("num [0-9]+(\\.[0-9]+)?");
  assert.equal(nums.dfa.states.length, 4);
});

test("a run has a frame for every character read, and a lexical error is skipped", () => {
  const sc = S.scnCompile(KW);
  const run = S.scnRun(sc, "ab <= ?c");
  const types = run.frames.map((f) => f.type);
  assert.equal(types[0], "start");
  assert.equal(types.filter((t) => t === "token").length, 3);
  assert.equal(types.filter((t) => t === "error").length, 1);
  assert.equal(types[types.length - 1], "end");
  const fine = run.frames.filter((f) => f.fine);
  assert.equal(fine.length > 0, true);
  assert.equal(run.frames.filter((f) => f.type === "read").length >= 7, true);
  const tok = run.frames.find((f) => f.type === "token" && f.tokens.length === 1);
  assert.equal(tok.tokens[0].lexeme, "ab");
  assert.equal(tok.path[0], 0);
});

test("bad patterns name their token", () => {
  assert.throws(() => S.scnCompile("id [a-z\nnum [0-9]+"), /Token id: Unterminated/);
  assert.throws(() => S.scnCompile(""), /No token rules/);
  assert.throws(() => S.scnParseRules("justaname"), /expected/);
});

test("scanner model: the text round trip, quoting, disabled rules and comments", () => {
  const M = load("grammar.js", "grammar-model.js", "scanner-model.js");
  const text = "// the tokens\nskip [ \\t\\n]+ -> skip\nnum [0-9]+(\\.[0-9]+)?\n'+' \\+\n'it''s' x\n// disabled: id [a-z]+";
  const m = M.smParse(text);
  assert.deepEqual(arr(m.rows.map((r) => r.kind === "rule" ? [r.name, r.skip, r.enabled] : r.text)), ["the tokens", ["skip", true, true], ["num", false, true], ["+", false, true], ["it's", false, true], ["id", false, false]]);
  assert.equal(M.smToText(m), text);
  assert.deepEqual(arr(M.smIndexes(m)), [null, 0, 1, 2, 3, null]);
  // a plain comment that looks like a rule stays a comment
  assert.equal(M.smParse("// the numbers").rows[0].kind, "comment");
  assert.throws(() => M.smParse("lonely"), /expected/);
  // the compiler tool's example token rules round-trip
  const ex = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tools", "compiler", "examples.json"), "utf8"));
  for (const g of ex.groups) for (const e of g.examples) assert.equal(M.smToText(M.smParse(e.tokens.join("\n"))), e.tokens.join("\n"), e.label);
});

test("the NFA is simplified: trivial ε-edges are contracted, and the DFA is the same", () => {
  const sc = S.scnCompile(KW);
  assert.equal(sc.nfa.n < sc.nfaRaw.n / 2, true, sc.nfa.n + " of " + sc.nfaRaw.n);
  const epsCount = (n) => n.edges.filter((e) => !e.set).length;
  assert.equal(epsCount(sc.nfa) < epsCount(sc.nfaRaw) / 2, true);
  const dfaRaw = S.scnBuildDFA(sc.nfaRaw);
  assert.equal(dfaRaw.states.length, sc.dfa.states.length);
  assert.deepEqual(arr(dfaRaw.trans), arr(sc.dfa.trans));
  // a single character stays one edge between two states under the start
  const one = S.scnCompile("a a");
  assert.equal(one.nfa.n, 2);
  assert.deepEqual(arr(one.nfa.edges.map((e) => [e.from, e.to, !!e.set])), [[0, 1, true]]);
  // every rule still has its own accepting state, and the start state is 0
  assert.equal(sc.nfa.accept.size, sc.rules.length);
  assert.equal(sc.nfa.edges.some((e) => e.to === 0), false);
});
