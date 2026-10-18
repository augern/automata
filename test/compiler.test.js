const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const C = load("grammar.js", "strings.js", "regex.js", "lr.js", "compiler.js");
const arr = (x) => JSON.parse(JSON.stringify(x));

const TOKENS = `skip [ \\t\\n]+ -> skip
float [0-9]+\\.[0-9]+
int [0-9]+
id [a-z][a-z0-9]*
'+' \\+
'*' \\*
'(' \\(
')' \\)
'=' =
';' ;
'<' <
'<=' <=`;

test("token rules: names may be quoted, -> skip marks discarded rules, comments are ignored", () => {
  const r = arr(C.cmpParseTokenRules("// c\nskip [ ]+ -> skip\n'+' \\+\nid [a-z]+"));
  assert.deepEqual(r.map((x) => [x.name, x.pattern, x.skip]), [["skip", "[ ]+", true], ["+", "\\+", false], ["id", "[a-z]+", false]]);
  assert.throws(() => C.cmpParseTokenRules("id"), /expected/);
  assert.throws(() => C.cmpParseTokenRules("// only"), /No token rules/);
});

test("scanner: longest match, the earliest rule on a tie, and how far it looked ahead", () => {
  const sc = C.cmpBuildScanner(C.cmpParseTokenRules(TOKENS));
  const at = (s, pos = 0) => arr(C.cmpScan(sc, [...s], pos));
  const name = (s, pos = 0) => sc.rules[C.cmpScan(sc, [...s], pos).rule].name;
  assert.equal(name("12.5"), "float");
  assert.equal(name("12+"), "int");
  assert.equal(name("<=3"), "<=");
  assert.equal(name("<3"), "<");
  // "12 " : the scanner looks at the space to see that the number ends, then backs up
  assert.deepEqual(at("12 3"), { rule: sc.rules.findIndex((r) => r.name === "int"), start: 0, end: 2, readTo: 3 });
  // "1." is an int followed by something else: it read the '.', found no digit, and backed up
  const r = at("1.+");
  assert.equal(sc.rules[r.rule].name, "int");
  assert.deepEqual([r.end, r.readTo], [1, 3]);
  // nothing matches / end of input
  assert.equal(at("?").rule, -1);
  assert.equal(at("", 0).rule, -2);
  assert.equal(at("a b", 3).rule, -2);
});

test("character classes expand to unions, with escapes", () => {
  assert.equal(C.cmpExpandPattern("[a-c]"), "(a|b|c)");
  assert.equal(C.cmpExpandPattern("[+*]x"), "(\\+|\\*)x");
  assert.equal(C.cmpExpandPattern("\\.[0-1]+"), "\\.(0|1)+");
  assert.throws(() => C.cmpExpandPattern("[ab"), /Unterminated/);
});

test("action language: arithmetic, attributes, locals, conditionals and calls", () => {
  const run = (src, args = [], fn = {}) => {
    const self = {};
    C.cmpRunAction(C.cmpParseAction(src), { args, self, locals: {}, fn });
    return self;
  };
  assert.equal(run("$$ = $1 + $3 * 2", [{ val: 1 }, {}, { val: 4 }]).val, 9);
  assert.equal(run("$$.type = int; $$.n = $1.n - 1", [{ n: 5 }]).type, "int");
  assert.equal(run("x = $1 * 2; $$ = x + x", [{ val: 3 }]).val, 12);
  assert.equal(run("$$ = $1 < 3 ? 'small' : 'big'", [{ val: 5 }]).val, "big");
  assert.equal(run("$$ = not ($1 == 2) and 1 or 0", [{ val: 5 }]).val, 1);
  assert.equal(run("$$ = f(1, 2) + 1", [], { f: (a, b) => a + b }).val, 4);
  assert.throws(() => run("$$ = $2", [{ val: 1 }]), /does not exist/);
  assert.throws(() => run("$$ = nothing(1)"), /Unknown function/);
  assert.throws(() => run("$$ = 1 / 0"), /Division by zero/);
  assert.throws(() => C.cmpParseAction("$$ = (1 +"), /Unexpected end/);
  assert.throws(() => C.cmpParseAction("$$ = @"), /Unexpected character/);
});

test("grammar with actions: alternatives on continuation lines, the action belongs to its alternative", () => {
  const g = C.cmpParseGrammar("E -> E '+' T {{ $$ = $1 + $3 }}\n | T\nT -> num");
  assert.deepEqual(arr(g.rules.map((r) => [r.lhs, r.rhs, r.action])), [["E′", ["E"], null], ["E", ["E", "+", "T"], "$$ = $1 + $3"], ["E", ["T"], null], ["T", ["num"], null]]);
  assert.deepEqual([...g.terminals].sort(), ["$", "+", "num"]);
});

const EVAL_TOKENS = `skip [ ]+ -> skip
num [0-9]+(\\.[0-9]+)?
'+' \\+
'*' \\*
'(' \\(
')' \\)`;
const EVAL_GRAMMAR = `<expr> -> <expr> '+' <term> {{ $$ = $1 + $3 }} | <term>
<term> -> <term> '*' <factor> {{ $$ = $1 * $3 }} | <factor>
<factor> -> '(' <expr> ')' {{ $$ = $2 }} | num`;

test("a run: the scanner is called when the parser needs a token, and the actions evaluate", () => {
  const comp = C.cmpCompile(EVAL_TOKENS, EVAL_GRAMMAR);
  assert.deepEqual(arr(comp.missing), []);
  assert.equal(comp.tables.conflicts.length, 0);
  const run = C.cmpRun(comp, "2 + 3 * 4");
  assert.equal(run.accepted, true);
  const last = run.frames[run.frames.length - 1];
  assert.equal(last.type, "accept");
  assert.equal(last.stack[last.stack.length - 1].attrs.val, 14);
  assert.equal(last.tokens.length, 5);
  // the first frame has read nothing; the first token appears only after the parser has asked for it
  assert.equal(run.frames[0].tokens.length, 0);
  assert.equal(run.frames[1].type, "scan");
  assert.equal(run.frames[1].lex.name, "num");
  // white space is skipped by the scanner, one frame each
  assert.equal(run.frames.filter((f) => f.type === "skip").length, 4);
  // reductions by default reductions happen before the next token is fetched: after shifting num the parser
  // reduces without a scan frame in between
  const types = run.frames.map((f) => f.type);
  const i = types.indexOf("shift");
  assert.deepEqual(arr(types.slice(i, i + 3)), ["shift", "reduce", "reduce"]);
});

test("a run: lexical and syntax errors stop the run with a message", () => {
  const comp = C.cmpCompile(EVAL_TOKENS, EVAL_GRAMMAR);
  let r = C.cmpRun(comp, "2 + ?");
  assert.equal(r.accepted, false);
  assert.match(r.frames[r.frames.length - 1].msg, /Lexical error/);
  r = C.cmpRun(comp, "2 + * 3");
  assert.equal(r.accepted, false);
  assert.match(r.frames[r.frames.length - 1].msg, /Syntax error.*expects/);
  r = C.cmpRun(comp, "2 +");
  assert.match(r.frames[r.frames.length - 1].msg, /Syntax error/);
});

test("a run: quads, types and the symbol table", () => {
  const tokens = `skip [ ]+ -> skip
float [0-9]+\\.[0-9]+
int [0-9]+
id [a-z]+
'=' =
';' ;
'+' \\+`;
  const grammar = `<prog> -> <stmts>
<stmts> -> <stmts> <stmt> | <stmt>
<stmt> -> id '=' <expr> ';' {{ install($1.lexeme, $3.type); emit('=', $3.place, '', $1.lexeme) }}
<expr> -> <expr> '+' <term> {{ $$.type = widen($1.type, $3.type); a = coerce($1.place, $1.type, $$.type); b = coerce($3.place, $3.type, $$.type); $$.place = newtemp(); emit('+', a, b, $$.place) }} | <term>
<term> -> int {{ $$.type = int; $$.place = $1.lexeme }} | float {{ $$.type = float; $$.place = $1.lexeme }} | id {{ require(lookup($1.lexeme) != '', 'undeclared ' + $1.lexeme); $$.type = lookup($1.lexeme); $$.place = $1.lexeme }}`;
  const comp = C.cmpCompile(tokens, grammar);
  const r = C.cmpRun(comp, "x = 1 + 2.5; y = x + 1;");
  assert.equal(r.accepted, true);
  const last = r.frames[r.frames.length - 1];
  assert.deepEqual(arr(last.quads), [["int2float", "1", "", "t1"], ["+", "t1", "2.5", "t2"], ["=", "t2", "", "x"], ["int2float", "1", "", "t3"], ["+", "x", "t3", "t4"], ["=", "t4", "", "y"]]);
  assert.deepEqual(arr(last.symtab), [{ name: "x", type: "float" }, { name: "y", type: "float" }]);
  assert.deepEqual(arr(last.messages), []);
  assert.deepEqual(arr(C.cmpRun(comp, "x = z + 1;").frames.pop().messages), ["undeclared z"]);
});
