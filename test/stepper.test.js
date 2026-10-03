const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// shared/stepper.js is a DOM-aware classic script; give it a fake document.
function makeStepper(opts) {
  const els = {};
  const document = { getElementById: (id) => (els[id] ||= { disabled: null }) };
  const ctx = vm.createContext({ document });
  const file = path.join(__dirname, "..", "shared", "stepper.js");
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  const buttons = { reset: "r", back: "b", step: "s", all: "a" };
  const calls = [];
  ctx.__opts = { buttons, onChange: (p) => calls.push(p), ...opts };
  const stepper = vm.runInContext("createStepper(__opts)", ctx);
  const state = () => ({ pos: stepper.pos, reset: els.r.disabled, back: els.b.disabled, step: els.s.disabled, all: els.a.disabled });
  return { stepper, calls, state };
}

test("moves within [min, last] and refreshes buttons", () => {
  const { stepper, calls, state } = makeStepper({ min: 0, last: () => 2 });
  stepper.refresh();
  assert.deepEqual(state(), { pos: 0, reset: true, back: true, step: false, all: false });
  stepper.next(); stepper.next();
  assert.deepEqual(state(), { pos: 2, reset: false, back: false, step: true, all: true });
  stepper.next(); // already at end: no move, no callback
  assert.equal(stepper.pos, 2);
  stepper.prev();
  assert.equal(stepper.pos, 1);
  assert.deepEqual(calls, [1, 2, 1]);
});

test("reset and end jump to the bounds", () => {
  const { stepper, state } = makeStepper({ min: 0, last: () => 5 });
  stepper.end();
  assert.equal(stepper.pos, 5);
  assert.equal(state().step, true);
  stepper.reset();
  assert.equal(stepper.pos, 0);
  assert.equal(state().back, true);
});

test("min = -1 gives a 'not started' position before the first step", () => {
  const { stepper, state } = makeStepper({ min: -1, last: () => 1 });
  assert.equal(stepper.pos, -1);
  stepper.next();
  assert.equal(stepper.pos, 0);
  stepper.prev();
  stepper.prev(); // clamped at min
  assert.equal(stepper.pos, -1);
  assert.equal(state().back, true);
});

test("no recorded data (last() === null): everything is disabled and moves do nothing", () => {
  const { stepper, calls, state } = makeStepper({ min: 0, last: () => null });
  stepper.refresh();
  assert.deepEqual(state(), { pos: 0, reset: true, back: true, step: true, all: true });
  stepper.next(); stepper.prev(); stepper.reset(); stepper.end();
  assert.deepEqual(calls, []);
});

test("last() is re-read each time, so the history can change", () => {
  let n = 1;
  const { stepper } = makeStepper({ min: 0, last: () => n });
  stepper.end();
  assert.equal(stepper.pos, 1);
  n = 4;
  stepper.end();
  assert.equal(stepper.pos, 4);
});
