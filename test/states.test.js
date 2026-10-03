const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { freshStateName, indexAfterRemoval, removeStateAt } = load("states.js");

test("freshStateName: next number when there are no gaps", () => {
  assert.equal(freshStateName(["q0", "q1", "q2"]), "q3");
  assert.equal(freshStateName([]), "q0");
});

test("freshStateName never returns an existing name, even after a removal leaves a gap", () => {
  // Regression: states.length-based naming returned "q2" for ["q0", "q2"], a duplicate.
  assert.equal(freshStateName(["q0", "q2"]), "q1");
  assert.equal(freshStateName(["q1", "q2"]), "q0");
  assert.equal(freshStateName(["q0", "q1", "q3"]), "q2");
});

test("freshStateName copes with custom names and prefixes", () => {
  assert.equal(freshStateName(["start", "end"]), "q0");
  assert.equal(freshStateName(["s0", "s1"], "s"), "s2");
});

test("repeated add/remove cycles never create duplicate names", () => {
  let states = ["q0", "q1", "q2", "q3"];
  for (const idx of [1, 0, 1, 0]) {
    states = states.filter((_, i) => i !== idx);
    states.push(freshStateName(states));
    assert.equal(new Set(states).size, states.length);
  }
});

test("removeStateAt: renumbers start and accepting states", () => {
  const m = { states: ["a", "b", "c", "d"], start: 2, accepts: new Set([0, 1, 3]) };
  const r = removeStateAt(m, 1);
  assert.equal(r.name, "b");
  assert.deepEqual([...r.states], ["a", "c", "d"]);
  assert.equal(r.start, 1);               // c moved from 2 to 1
  assert.deepEqual([...r.accepts].sort(), [0, 2]); // a stays 0, d moves 3 -> 2, b is gone
});

test("removeStateAt: removing the start state moves start to the state that replaces it", () => {
  const r = removeStateAt({ states: ["a", "b", "c"], start: 1, accepts: new Set() }, 1);
  assert.equal(r.start, 1);
  assert.equal(r.states[r.start], "c");
});

test("removeStateAt: removing the last state when it is the start keeps start in range", () => {
  const r = removeStateAt({ states: ["a", "b", "c"], start: 2, accepts: new Set([2]) }, 2);
  assert.equal(r.start, 1);
  assert.equal(r.accepts.size, 0);
});

test("removeStateAt: refuses to remove the only state or an invalid index", () => {
  assert.equal(removeStateAt({ states: ["a"], start: 0, accepts: new Set() }, 0), null);
  assert.equal(removeStateAt({ states: ["a", "b"], start: 0, accepts: new Set() }, 5), null);
  assert.equal(removeStateAt({ states: ["a", "b"], start: 0, accepts: new Set() }, -1), null);
});

test("indexAfterRemoval (used for TM start/accept/reject markers)", () => {
  assert.equal(indexAfterRemoval(0, 2, 4), 0);
  assert.equal(indexAfterRemoval(3, 2, 4), 2);
  assert.equal(indexAfterRemoval(2, 2, 4), 2); // replaced by the next state
  assert.equal(indexAfterRemoval(3, 3, 4), 2); // was last, clamp to new last
});
