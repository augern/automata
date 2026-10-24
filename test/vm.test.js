const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load.js");

const V = load("grammar.js", "strings.js", "regex.js", "lr.js", "scanner.js", "compiler.js", "vm.js");
const arr = (x) => JSON.parse(JSON.stringify(x));
const final = (r) => r.states[r.states.length - 1];

test("postfix: an expression and an assignment", () => {
  assert.equal(V.vmIsPostfix("x 10 k 30 * + :="), true);
  assert.equal(V.vmIsPostfix("hello world"), false);
  assert.equal(V.vmIsPostfix("42"), false);
  assert.deepEqual(arr(V.vmPostfixVariables("x 10 k 30 * + :=")), ["x", "k"]);
  const r = V.vmPostfix("x 10 k 30 * + :=", { x: 0, k: 2 });
  assert.equal(final(r).vars.x, 70);
  assert.equal(final(r).done, true);
  // the stack grows and shrinks: after 10 k 30 the stack holds x, 10, k, 30
  assert.deepEqual(arr(r.states[4].stack), ["x", "10", "k", "30"]);
  assert.equal(r.states.length, r.prog.length + 1);
});

test("postfix: if-then-else and while with labels, JEQZ and JUMP", () => {
  const ife = "a b + L1 JEQZ x 4 := L2 JUMP L1: x 33 := L2:";
  assert.equal(final(V.vmPostfix(ife, { a: 1, b: 2, x: 0 })).vars.x, 4);
  assert.equal(final(V.vmPostfix(ife, { a: 0, b: 0, x: 0 })).vars.x, 33);
  const loop = "L1: i 3 < L2 JEQZ s s i + := i i 1 + := L1 JUMP L2:";
  const r = V.vmPostfix(loop, { i: 0, s: 0 });
  assert.equal(final(r).vars.s, 3);
  assert.equal(final(r).vars.i, 3);
  assert.equal(final(r).error, undefined);
  // a loop that does not end is stopped
  const forever = V.vmPostfix("L1: x 1 + L2 JEQZ L1 JUMP L2:", { x: 0 });
  assert.equal(final(forever).error, true);
  assert.match(final(forever).note, /Stopped after/);
});

test("postfix: errors are reported at the instruction", () => {
  assert.match(final(V.vmPostfix("a 1 +", {})).note, /a has no value/);
  assert.match(final(V.vmPostfix("1 0 /", {})).note, /division by zero/);
  assert.match(final(V.vmPostfix("+", {})).note, /empty/);
  assert.match(final(V.vmPostfix("1 L9 JUMP", {})).note, /defined/);
});

test("quadruples: the lecture's if-then-else, run on both branches", () => {
  const q = [["=", "a", "b", "t1"], ["JEQZ", "t1", "", "(6)"], ["+", "x", "1", "t2"], [":=", "t2", "", "x"], ["JUMP", "", "", "(7)"], [":=", "20", "", "y"]];
  assert.deepEqual(arr(V.vmQuadVariables(q)), ["a", "b", "x", "y"]);
  const yes = V.vmQuads(q, { a: 1, b: 1, x: 5, y: 0 });
  assert.equal(final(yes).vars.x, 6);
  assert.equal(final(yes).vars.y, 0);
  const no = V.vmQuads(q, { a: 2, b: 1, x: 5, y: 0 });
  assert.equal(final(no).vars.x, 5);
  assert.equal(final(no).vars.y, 20);
  assert.equal(final(no).done, true);
  assert.equal(yes.states[0].pc, 0);
});

test("quadruples: a loop, assignments with = and conversions, and errors", () => {
  const loop = [["<", "i", "10", "t1"], ["JEQZ", "t1", "", "(6)"], ["+", "i", "1", "t2"], [":=", "t2", "", "i"], ["JUMP", "", "", "(1)"]];
  assert.equal(final(V.vmQuads(loop, { i: 0 })).vars.i, 10);
  const conv = [["int2float", "n", "", "t1"], ["*", "t1", "2.5", "t2"], ["=", "t2", "", "y"]];
  assert.equal(final(V.vmQuads(conv, { n: 2 })).vars.y, 5);
  assert.match(final(V.vmQuads([["JUMP", "", "", "?"]], {})).note, /not been patched/);
  assert.match(final(V.vmQuads([["+", "a", "1", "t1"]], {})).note, /a has no value/);
  assert.equal(final(V.vmQuads([["JUMP", "", "", "(1)"]], {})).error, true);
});

test("the control-structure examples of the compiler tool produce code the machines run", () => {
  const ex = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tools", "compiler", "examples.json"), "utf8"));
  const find = (label) => ex.groups.flatMap((g) => g.examples).find((e) => e.label === label);
  const run = (e, s) => { const c = V.cmpCompile(e.tokens.join("\n"), e.text); const r = V.cmpRun(c, s); return r.frames[r.frames.length - 1]; };
  const pf = find("Postfix code for if and while");
  const f = run(pf, "begin i := 0; while i < 3 do begin s := s + i; i := i + 1 end end");
  const code = f.stack[1].attrs.val;
  assert.equal(V.vmIsPostfix(code), true);
  assert.equal(final(V.vmPostfix(code, { i: 0, s: 0 })).vars.s, 3);
  const nested = run(pf, "if a + b then if c - d then x := 10 else y := 20 else z := 30").stack[1].attrs.val;
  assert.equal(final(V.vmPostfix(nested, { a: 1, b: 0, c: 5, d: 5, x: 0, y: 0, z: 0 })).vars.y, 20);
  assert.equal(final(V.vmPostfix(nested, { a: 0, b: 0, c: 5, d: 5, x: 0, y: 0, z: 0 })).vars.z, 30);
  const bp = find("Quadruples with backpatching");
  const q = run(bp, "if a < b then if c = d then x := 1 else x := 2 else y := 3").quads;
  assert.equal(final(V.vmQuads(q, { a: 1, b: 2, c: 7, d: 7, x: 0, y: 0 })).vars.x, 1);
  assert.equal(final(V.vmQuads(q, { a: 1, b: 2, c: 7, d: 8, x: 0, y: 0 })).vars.x, 2);
  assert.equal(final(V.vmQuads(q, { a: 3, b: 2, c: 7, d: 8, x: 0, y: 0 })).vars.y, 3);
  // the translation-to-postfix example is postfix too
  const tp = run(find("Translation to postfix"), "(a + b) * c").stack[1].attrs.val;
  assert.equal(final(V.vmPostfix(tp, { a: 1, b: 2, c: 4 })).stack[0], "12");
});

test("quadruples: array references and procedure calls, as in the lecture", () => {
  // A[I] := B  (the address, then the store through it) and B := A[I]
  const store = [["[]=", "a", "i", "t1"], [":=", "b", "", "t1"]];
  assert.deepEqual(arr(V.vmQuadArrays(store)), ["a"]);
  assert.deepEqual(arr(V.vmQuadVariables(store)), ["i", "t1", "b"].filter((x) => x !== "t1"));
  const r = V.vmQuads(store, { i: 2, b: 99 }, { arrays: { a: [1, 2, 3, 4] } });
  assert.deepEqual(arr(final(r).arrays.a), [1, 2, 99, 4]);
  const load = [["=[]", "a", "i", "t2"], [":=", "t2", "", "b"]];
  assert.equal(final(V.vmQuads(load, { i: 3, b: 0 }, { arrays: { a: [1, 2, 3, 4] } })).vars.b, 4);
  assert.match(final(V.vmQuads(load, { i: 4, b: 0 }, { arrays: { a: [1, 2, 3, 4] } })).note, /outside the array/);
  // WRITE(A*B, X+5): the arguments are computed, then param, param, call
  const write = [["*", "a", "b", "t1"], ["+", "x", "5", "t2"], ["param", "t1", "", ""], ["param", "t2", "", ""], ["call", "WRITE", "2", ""]];
  assert.deepEqual(arr(V.vmQuadVariables(write)), ["a", "b", "x"]);
  const w = V.vmQuads(write, { a: 2, b: 3, x: 1 });
  assert.deepEqual(arr(final(w).output), ["6 6"]);
  assert.deepEqual(arr(w.states[4].params), ["6", "6"]);
  assert.deepEqual(arr(final(w).params), []);
  // READ(X)
  const read = [["param", "x", "", ""], ["call", "READ", "1", ""]];
  assert.equal(V.vmQuadsRead(read), true);
  assert.equal(final(V.vmQuads(read, { x: 0 }, { input: [42] })).vars.x, 42);
  assert.match(final(V.vmQuads(read, { x: 0 }, { input: [] })).note, /no more input/);
  // an unknown procedure is only noted
  assert.match(final(V.vmQuads([["param", "5", "", ""], ["call", "f", "1", ""]], {})).note, /f is called with 5/);
  assert.match(final(V.vmQuads([["call", "f", "2", ""]], {})).note, /only 0 have been put/);
});
