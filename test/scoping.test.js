const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const S = load("scoping.js");
const run = (src, scoping, passing) => S.scoRun(src, { scoping, passing });
const out = (r) => r.output.join(" ");
const arr = (x) => JSON.parse(JSON.stringify(x));
const MODES = { V: "value", R: "reference", VR: "valueresult", N: "name" };

// Programs from drafts/scoping-examples.md; "expect" gives the output for each mode, or { error } for a run that stops.
const PASSING = [
  {
    name: "aliasing a global",
    src: "var g = 0; proc p(a) { a = a + 1; g = g + 10; print a; } call p(g); print g;",
    expect: { V: "1 10", R: "11 11", VR: "1 1", N: "11 11" },
  },
  {
    name: "swap",
    src: "var x = 1; var y = 2; proc swap(a, b) { var t = a; a = b; b = t; } call swap(x, y); print x; print y;",
    expect: { V: "1 2", R: "2 1", VR: "2 1", N: "2 1" },
  },
  {
    name: "aliased arguments, copy-out order",
    src: "var x = 0; proc p(a, b) { a = 1; } call p(x, x); print x;",
    expect: { V: "0", R: "1", VR: "0", N: "1" },
  },
  {
    name: "swap(i, a[i])",
    src: "var i = 1; array a[1..2] = {10, 20}; proc swap(p, q) { var t = p; p = q; q = t; } call swap(i, a[i]); print i; print a[1]; print a[2];",
    expect: { V: "1 10 20", R: "10 1 20", VR: "10 1 20", N: { error: "a[10] is out of range 1..2" } },
  },
  {
    name: "evaluations and side effects",
    src: "var n = 0; func tick() { n = n + 1; return n; } func twice(x) { return x + x; } print twice(tick()); print n;",
    expect: { V: "2 1", R: "2 1", VR: "2 1", N: "3 2" },
  },
  {
    name: "an argument that is never used",
    src: "func loop() { while (1 == 1) { } return 0; } func first(a, b) { return a; } print first(7, loop());",
    expect: { V: { error: "Stopped after 500 steps" }, R: { error: "Stopped after 500 steps" }, VR: { error: "Stopped after 500 steps" }, N: "7" },
  },
  {
    name: "Jensen's device",
    src: `var i = 1;
array a[1..4] = {1, 2, 3, 4};
func sum(k, lo, hi, term) {
  var s = 0;
  k = lo;
  while (k <= hi) { s = s + term; k = k + 1; }
  return s;
}
print sum(i, 1, 4, a[i]);
print sum(i, 1, 4, a[i] * a[i]);`,
    expect: { V: "4 4", R: { out: "4", error: "a[5] is out of range 1..4" }, VR: { out: "4", error: "a[5] is out of range 1..4" }, N: "10 30" },
  },
  {
    name: "passing an array",
    src: "array a[1..3] = {1, 2, 3}; proc clear(v) { v[1] = 0; } proc replace(v) { array w[1..3] = {9, 9, 9}; v = w; } call clear(a); print a[1]; call replace(a); print a[1];",
    expect: { V: "0 0", R: "0 9", VR: "0 9", N: "0 9" },
  },
];

for (const ex of PASSING) {
  for (const [key, mode] of Object.entries(MODES)) {
    test(`passing: ${ex.name}, ${mode}`, () => {
      const r = run(ex.src, "static", mode), want = ex.expect[key];
      if (typeof want === "string") {
        assert.equal(r.error, null, r.error && r.error.message);
        assert.equal(out(r), want);
      } else {
        assert.ok(r.error, "expected an error");
        assert.ok(r.error.message.startsWith(want.error), r.error.message);
        if (want.out !== undefined) assert.equal(out(r), want.out);
      }
    });
  }
}

const SCOPING = [
  { name: "a free name", src: "var x = 1; proc f() { print x; } proc g() { var x = 2; call f(); } call g(); call f();", static: "1 1", dynamic: "2 1" },
  {
    name: "definition nesting against call chain",
    src: "var n = 10; proc outer() { var n = 20; proc inner() { print n; } proc middle() { var n = 30; call inner(); } call middle(); } call outer();",
    static: "20", dynamic: "30",
  },
  { name: "a parameter captures a free name", src: "var limit = 3; proc show() { print limit; } proc run(limit) { call show(); } call run(99); call show();", static: "3 3", dynamic: "99 3" },
  { name: "a block", src: "var x = 1; { var x = 2; print x; } print x;", static: "2 1", dynamic: "2 1" },
  { name: "recursion", src: "proc f(n) { var x = n; if (n > 0) { call f(n - 1); } print x; } call f(2);", static: "0 1 2", dynamic: "0 1 2" },
];

for (const ex of SCOPING) {
  for (const scoping of ["static", "dynamic"]) {
    test(`scoping: ${ex.name}, ${scoping}`, () => {
      const r = run(ex.src, scoping, "value");
      assert.equal(r.error, null, r.error && r.error.message);
      assert.equal(out(r), ex[scoping]);
    });
  }
}

test("a thunk and the callee's local: scoping and passing together", () => {
  const src = "var t = 5; proc p(a) { var t = 100; print a; } call p(t + 1);";
  for (const mode of ["value", "reference", "valueresult"]) {
    for (const scoping of ["static", "dynamic"]) assert.equal(out(run(src, scoping, mode)), "6", `${mode} ${scoping}`);
  }
  assert.equal(out(run(src, "static", "name")), "6");
  assert.equal(out(run(src, "dynamic", "name")), "101");
});

test("events: each carries the state after it, and lookups are fine", () => {
  const r = run("var x = 1; proc f() { print x; } call f();", "static", "value");
  assert.equal(r.error, null);
  const kinds = r.events.map((e) => e.kind);
  assert.deepEqual(arr(kinds.filter((k) => k !== "lookup")), ["declare", "declare", "call", "print", "return", "done"]);
  assert.ok(r.events.filter((e) => e.kind === "lookup").every((e) => e.fine));
  const call = r.events.find((e) => e.kind === "call");
  assert.deepEqual(arr(call.state.frames.map((f) => f.label)), ["global", "f"]);
  assert.equal(call.state.frames[1].staticId, 0);
  assert.equal(call.state.frames[1].dynId, 0);
  const found = r.events.find((e) => e.kind === "lookup" && e.name === "x");
  assert.deepEqual(arr(found.chain), [1, 0]);
  assert.equal(found.hit, 0);
});

test("lookup chains: static follows the definition, dynamic the call", () => {
  const src = "var n = 10; proc outer() { var n = 20; proc inner() { print n; } proc middle() { var n = 30; call inner(); } call middle(); } call outer();";
  const chainOf = (scoping) => run(src, scoping, "value").events.find((e) => e.kind === "lookup" && e.name === "n").chain.length;
  assert.equal(chainOf("static"), 2);
  assert.equal(chainOf("dynamic"), 2);
  const frames = (scoping) => run(src, scoping, "value").events.find((e) => e.kind === "lookup" && e.name === "n").hit;
  assert.notEqual(frames("static"), frames("dynamic"));
});

test("the store shows only what the active frames reach; aliases share a location", () => {
  const r = run("var g = 0; proc p(a) { a = 1; } call p(g);", "static", "reference");
  const call = r.events.find((e) => e.kind === "call");
  const [glob, p] = call.state.frames;
  assert.equal(glob.binds.find((b) => b.name === "g").loc, p.binds.find((b) => b.name === "a").loc);
  const done = r.events[r.events.length - 1];
  assert.equal(done.state.store.length, 1);
  assert.deepEqual(arr(call.bindings.map((b) => b.how)), ["alias"]);
  const v = run("var g = 0; proc p(a) { a = 1; } call p(g);", "static", "value").events.find((e) => e.kind === "call");
  assert.equal(v.state.store.length, 2);
});

test("name passing counts the evaluations of a thunk", () => {
  const r = run("var n = 0; func tick() { n = n + 1; return n; } func twice(x) { return x + x; } print twice(tick());", "static", "name");
  const last = r.events.filter((e) => e.kind === "thunk").length;
  assert.equal(last, 2);
  const call = r.events.filter((e) => e.kind === "call").find((e) => e.text.startsWith("call twice"));
  assert.deepEqual(arr(call.bindings), [{ param: "x", how: "thunk", text: "tick()" }]);
});

test("errors stop the run with an event and a line", () => {
  const r = run("var x = 1;\nprint y;", "static", "value");
  assert.equal(r.error.message, "y is not declared");
  assert.equal(r.error.line, 2);
  assert.equal(r.events[r.events.length - 1].kind, "error");
  assert.equal(run("var x = 1; var x = 2;", "static", "value").error.message, "x is already declared here");
  assert.equal(run("print 1 / 0;", "static", "value").error.message, "division by zero");
  assert.equal(run("proc p() { } print p();", "static", "value").error.message, "p is a proc and returns no value");
  assert.equal(run("proc p(a) { } call p();", "static", "value").error.message, "p takes 1 arguments, 0 given");
  assert.equal(run("proc p() { return 1; } call p();", "static", "value").error.message, "return is only for a func");
  assert.equal(run("proc p(a) { a = 1; } call p(2);", "static", "name").error.message, "cannot assign to a: its argument 2 is not a variable");
});

test("assigning to a reference parameter with a value as argument uses a temporary", () => {
  const r = run("proc p(a) { a = 5; print a; } call p(2);", "static", "reference");
  assert.equal(r.error, null);
  assert.equal(out(r), "5");
});

test("the parser: comments, precedence, printing an array and the messages", () => {
  assert.equal(out(run("print 2 + 3 * 4; // a comment\nprint (2 + 3) * 4; print -3 + 5; print 7 / 2;", "static", "value")), "14 20 2 3");
  assert.equal(out(run("array a[1..3] = {4, 5}; print a;", "static", "value")), "[4, 5, 0]");
  for (const [src, msg] of [
    ["var x = ;", "expected an expression, found ';'"],
    ["print 1", "expected ';', found the end of the program"],
    ["proc p(a, a) { }", "a parameter name is repeated"],
    ["x = 1 y", "expected ';', found y"],
    ["var x = 1 @", "unexpected character '@'"],
    ["{ var x = 1;", "expected '}', found the end of the program"],
  ]) {
    const r = S.scoRun(src);
    assert.equal(r.error.message, msg, src);
  }
  assert.equal(S.scoRun("var x = 1;\nvar y = ;").error.line, 2);
});

test("scoExprText prints an expression back with the parentheses it needs", () => {
  const e = (src) => S.scoExprText(S.scoParse("print " + src + ";").body[0].e);
  assert.equal(e("(a + b) * c"), "(a + b) * c");
  assert.equal(e("a + b * c"), "a + b * c");
  assert.equal(e("a[i] * a[i]"), "a[i] * a[i]");
  assert.equal(e("f(1, x + 2)"), "f(1, x + 2)");
});
