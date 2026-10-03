const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { tmBuildConfigs, tmRun, tmTapeRead, tmTapeWrite, TM_BLANK } = load("tm.js");
const B = TM_BLANK;

// Build a TM; `rules` are [state, read, next, write, dir].
function tm(states, { start, accept, reject }, rules) {
  const trans = {};
  for (const s of states) trans[s] = {};
  for (const [s, read, next, write, dir] of rules) trans[s][read] = { next, write, dir };
  return { states, start: states.indexOf(start), accept: states.indexOf(accept), reject: states.indexOf(reject), trans };
}
const ST = (states, start = states[0]) => ({ start, accept: "qA", reject: "qR" });

// Even number of a's.
const EVEN = tm(["q0", "q1", "qA", "qR"], ST(["q0"]), [
  ["q0", "a", "q1", "a", "R"], ["q0", B, "qA", B, "R"],
  ["q1", "a", "q0", "a", "R"], ["q1", B, "qR", B, "R"],
]);

// aⁿbⁿ (n ≥ 1) — the classic marking machine, rewrites a→X, b→Y.
const ANBN = tm(["q0", "q1", "q2", "q3", "qA", "qR"], ST(["q0"]), [
  ["q0", "a", "q1", "X", "R"],
  ["q0", "Y", "q3", "Y", "R"],
  ["q1", "a", "q1", "a", "R"], ["q1", "Y", "q1", "Y", "R"], ["q1", "b", "q2", "Y", "L"],
  ["q2", "a", "q2", "a", "L"], ["q2", "Y", "q2", "Y", "L"], ["q2", "X", "q0", "X", "R"],
  ["q3", "Y", "q3", "Y", "R"], ["q3", B, "qA", B, "R"],
]);

// Unary increment: 111 -> 1111.
const INC = tm(["q0", "qA", "qR"], ST(["q0"]), [
  ["q0", "1", "q0", "1", "R"], ["q0", B, "qA", "1", "R"],
]);

test("tape: absent cells read blank; writing blank keeps the map sparse", () => {
  const tape = new Map();
  assert.equal(tmTapeRead(tape, 5), B);
  tmTapeWrite(tape, 5, "x");
  assert.equal(tmTapeRead(tape, 5), "x");
  tmTapeWrite(tape, 5, B);
  assert.equal(tape.size, 0);
});

test("even number of a's", () => {
  for (const w of ["", "aa", "aaaa"]) assert.equal(tmRun(EVEN, w).outcome, "accept", w);
  for (const w of ["a", "aaa"]) assert.equal(tmRun(EVEN, w).outcome, "reject", w);
});

test("aⁿbⁿ (n ≥ 1) marking machine", () => {
  for (const w of ["ab", "aabb", "aaabbb"]) assert.equal(tmRun(ANBN, w).outcome, "accept", w);
  for (const w of ["", "a", "b", "ba", "aab", "abb", "abab"]) assert.equal(tmRun(ANBN, w).outcome, "reject", w);
});

test("computation: unary increment writes the result on the tape", () => {
  const res = tmRun(INC, "111");
  assert.equal(res.outcome, "accept");
  assert.equal(res.tape, "1111");
  assert.equal(res.steps, 4);
});

test("missing transition is an implicit halt-reject with an 'implicit' action", () => {
  const { configs, didNotHalt } = tmBuildConfigs(EVEN, "b");
  const last = configs.at(-1);
  assert.equal(didNotHalt, false);
  assert.equal(last.state, "qR");
  assert.equal(last.action.implicit, true);
  assert.equal(last.action.fromState, "q0");
  assert.equal(last.action.sym, "b");
});

test("configs are snapshots: earlier tapes are not mutated by later steps", () => {
  const { configs } = tmBuildConfigs(INC, "11");
  assert.equal(tmTapeRead(configs[0].tape, 2), B);
  assert.equal(tmTapeRead(configs.at(-1).tape, 2), "1");
});

test("a looping machine stops at the step limit and reports didNotHalt", () => {
  const loop = tm(["q0", "qA", "qR"], ST(["q0"]), [["q0", B, "q0", B, "R"]]);
  const res = tmBuildConfigs(loop, "", 50);
  assert.equal(res.didNotHalt, true);
  assert.equal(res.configs.length, 51);
  assert.equal(tmRun(loop, "", 50).outcome, "limit");
});

test("head can move left of the input (negative positions)", () => {
  const left = tm(["q0", "qA", "qR"], ST(["q0"]), [["q0", "a", "qA", "b", "L"]]);
  const res = tmRun(left, "a");
  assert.equal(res.head, -1);
  assert.equal(res.tape, "b");
});

test("a machine that starts in the accept state accepts immediately", () => {
  const m = tm(["qA", "qR"], { start: "qA", accept: "qA", reject: "qR" }, []);
  const res = tmRun(m, "abc");
  assert.equal(res.outcome, "accept");
  assert.equal(res.steps, 0);
});
