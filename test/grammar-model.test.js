const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const G = load("grammar.js", "grammar-model.js");
const plain = (x) => JSON.parse(JSON.stringify(x));
const EXPR = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`;

test("the model has one row per production; | is only how adjacent left sides are written", () => {
  const m = G.gmParse(EXPR);
  assert.equal(m.rows.length, 6);
  assert.deepEqual(plain(m.rows.map((r) => [r.lhs.join(" "), r.rhs.map((s) => s.sym)])), [["E", ["E", "+", "T"]], ["E", ["T"]], ["T", ["T", "*", "F"]], ["T", ["F"]], ["F", ["(", "E", ")"]], ["F", ["id"]]]);
  assert.equal(G.gmToText(m), EXPR);
});

test("text round trip keeps order, the arrow, ε spellings, quoting and comments", () => {
  const text = "// the language\nS → a S b | ε\nS → '|' \"it's\" '' x\nT -> eps";
  const m = G.gmParse(text);
  assert.equal(m.arrow, "→");
  assert.equal(G.gmParse(G.gmToText(m)).rows.length, m.rows.length);
  assert.equal(G.gmToText(m), "// the language\nS → a S b | ε | '|' \"it's\" '' x\nT → eps");
});

test("continuation lines starting with | belong to the previous left side", () => {
  const m = G.gmParse("E -> E + T\n  | T\nT -> id");
  assert.deepEqual(plain(m.rows.map((r) => r.lhs[0])), ["E", "E", "T"]);
  assert.throws(() => G.gmParse("| a"), /before the first rule/);
  assert.throws(() => G.gmParse("S a"), /Missing '->'/);
});

test("a disabled rule is a comment that is exactly one rule", () => {
  const m = G.gmParse("S -> a\n// S -> b\n// just a note");
  assert.deepEqual(plain(m.rows.map((r) => [r.kind, r.enabled])), [["rule", true], ["rule", false], ["comment", null]]);
  assert.equal(G.gmToText(m), "S -> a\n// S -> b\n// just a note");
  assert.deepEqual([...G.gmNonterminals(m)], ["S"]);
});

test("production numbers count the enabled rules; a left side is faded after an enabled rule with the same left side", () => {
  const m = G.gmParse("A -> a | b\nB -> c\nA -> d\n// A -> e\nA -> f");
  assert.deepEqual(plain(G.gmNumbers(m)), [1, 2, 3, 4, null, 5]);
  assert.deepEqual(plain(G.gmGhosts(m)), [false, true, false, false, false, false]);
});

test("symbols are quoted when the text needs it", () => {
  assert.equal(G.gmSymText({ sym: "|", quoted: false }), "'|'");
  assert.equal(G.gmSymText({ sym: "a b", quoted: false }), "'a b'");
  assert.equal(G.gmSymText({ sym: "it's", quoted: true }), '"it\'s"');
  assert.equal(G.gmSymText({ sym: "eps", quoted: false }), "'eps'");
  assert.equal(G.gmSymText({ sym: "+", quoted: false }), "+");
  assert.equal(G.gmSymText({ sym: "'", quoted: false }), '"\'"');
});

test("edits return new models: insert, remove, move, update", () => {
  const m = G.gmParse("A -> a\nB -> b\nB -> c");
  const m2 = G.gmInsert(m, 1, G.gmNewRule("A", ["x"]));
  assert.equal(G.gmToText(m2), "A -> a | x\nB -> b | c");
  assert.equal(G.gmToText(m), "A -> a\nB -> b | c", "the original is unchanged");
  assert.equal(G.gmToText(G.gmRemove(m, 0)), "B -> b | c");
  assert.equal(G.gmToText(G.gmMove(m, 0, 1)), "B -> b\nA -> a\nB -> c");
  assert.equal(G.gmToText(G.gmUpdate(m, 1, { enabled: false })), "A -> a\n// B -> b\nB -> c");
});

test("the parser reads what the model writes: every example grammar round-trips to the same productions", () => {
  const fs = require("node:fs"), path = require("node:path");
  const lib = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "shared", "grammars.json"), "utf8"));
  for (const [key, g] of Object.entries(lib)) {
    const text = g.text.join("\n");
    const again = G.gmToText(G.gmParse(text));
    const a = G.parseBNF(text, false), b = G.parseBNF(again, false);
    assert.deepEqual(plain(a.rules), plain(b.rules), key);
  }
});

test("an empty right side is ε: it is numbered, written to the text, and spelled as it was", () => {
  let m = G.gmParse("A -> a | eps\nB -> ε");
  assert.deepEqual(plain(m.rows.map((r) => r.rhs.length)), [1, 0, 0]);
  assert.deepEqual(plain(G.gmNumbers(m)), [1, 2, 3]);
  assert.equal(G.gmToText(m), "A -> a | eps\nB -> ε");
  m = G.gmInsert(m, 1, G.gmNewRule("A"));
  assert.equal(G.gmToText(m), "A -> a | ε | eps\nB -> ε", "a new empty rule is the ε production");
  assert.equal(G.parseBNF(G.gmToText(m), false).rules[1].rhs.length, 0);
});

test("actions: {{ … }} belong to their alternative, and round-trip with each alternative on its own line", () => {
  const text = "<expr> → <expr> '+' <term> {{ $$ = $1 + $3 }}\n  | <expr> '|' <term> {{ $$ = $1 | $3 }}\n  | <term>\n<term> → id {{ $$ = 1 }}";
  const m = G.gmParse(text, { actions: true });
  assert.deepEqual(plain(m.rows.map((r) => r.action || null)), ["$$ = $1 + $3", "$$ = $1 | $3", null, "$$ = 1"]);
  assert.deepEqual(plain(m.rows[1].rhs.map((s) => s.sym)), ["<expr>", "|", "<term>"]);
  assert.equal(G.gmToText(m, { actions: true }), text);
  // a disabled production keeps its action in the comment
  m.rows[0].enabled = false;
  const t2 = G.gmToText(m, { actions: true });
  assert.equal(t2.split("\n")[0], "// <expr> → <expr> '+' <term> {{ $$ = $1 + $3 }}");
  assert.equal(plain(G.gmParse(t2, { actions: true }).rows[0].action), "$$ = $1 + $3");
  // without the option, nothing is an action
  assert.equal(G.gmParse("S -> a", {}).rows[0].action, undefined);
});

test("the example definitions of the compiler tool round-trip through the model", () => {
  const ex = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "tools", "compiler", "examples.json"), "utf8"));
  const norm = (t) => t.split("\n").map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean).join("\n");
  for (const g of ex.groups) for (const e of g.examples) {
    const m = G.gmParse(e.text, { actions: true });
    assert.equal(norm(G.gmToText(m, { actions: true })), norm(e.text), e.label);
  }
});
