const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { panelDrag, panelWeights, fitPanels } = load("panels.js");
const P = (min, priority, extra = {}) => ({ min, priority, collapsed: false, auto: false, locked: false, ...extra });
const arr = (x) => Array.from(x);

test("panelDrag moves the boundary and keeps the pair's total width", () => {
  const r = panelDrag({ widthL: 300, widthR: 500, minL: 150, minR: 200, dx: 100 });
  assert.deepEqual({ ...r }, { left: 400, right: 400 });
  assert.equal(r.left + r.right, 800);
});

test("panelDrag respects both minimums", () => {
  assert.deepEqual({ ...panelDrag({ widthL: 300, widthR: 500, minL: 150, minR: 200, dx: -999 }) }, { left: 150, right: 650 });
  assert.deepEqual({ ...panelDrag({ widthL: 300, widthR: 500, minL: 150, minR: 200, dx: 999 }) }, { left: 600, right: 200 });
});

test("panelDrag when the pair is already below its minimums does not invert", () => {
  const r = panelDrag({ widthL: 100, widthR: 100, minL: 150, minR: 150, dx: 20 });
  assert.equal(r.left, 150);
  assert.equal(r.left + r.right, 200);
});

test("panelWeights: collapsed panels weigh nothing, others keep their width", () => {
  assert.deepEqual(arr(panelWeights([300, 22, 500.126], [false, true, false])), [300, 0, 500.13]);
});

test("fitPanels: nothing to do when everything fits", () => {
  const r = fitPanels([P(200, 1), P(200, 2), P(200, 3)], 700);
  assert.deepEqual([arr(r.collapse), arr(r.expand)], [[], []]);
});

test("fitPanels: collapses the lowest priority first until it fits", () => {
  const panels = [P(200, 3), P(200, 1), P(200, 2)];
  assert.deepEqual(arr(fitPanels(panels, 500, 22).collapse), [1]); // 200+22+200 = 422 <= 500
  assert.deepEqual(arr(fitPanels(panels, 430, 22).collapse), [1]);
  assert.deepEqual(arr(fitPanels(panels, 300, 22).collapse), [1, 2]); // 200+22+22 = 244
});

test("fitPanels: locked panels are never collapsed; the row may then overflow", () => {
  const panels = [P(300, 1, { locked: true }), P(300, 2, { locked: true })];
  assert.deepEqual(arr(fitPanels(panels, 400, 22).collapse), []);
  const mixed = [P(300, 1, { locked: true }), P(300, 2), P(300, 3, { locked: true })];
  assert.deepEqual(arr(fitPanels(mixed, 700, 22).collapse), [1]);
});

test("fitPanels: already-collapsed panels count as strips", () => {
  const panels = [P(300, 1, { collapsed: true }), P(300, 2), P(300, 3)];
  assert.deepEqual(arr(fitPanels(panels, 640, 22).collapse), []); // 22+300+300 = 622
  assert.deepEqual(arr(fitPanels(panels, 600, 22).collapse), [1]);
});

test("fitPanels: re-expands auto-collapsed panels, highest priority first, only while they fit", () => {
  const panels = [P(200, 3), P(200, 1, { collapsed: true, auto: true }), P(200, 2, { collapsed: true, auto: true })];
  // 200 + 22 + 22 = 244 used; opening one more panel needs +178
  assert.deepEqual(arr(fitPanels(panels, 430, 22).expand), [2]); // priority 2 wins; the second would not fit
  assert.deepEqual(arr(fitPanels(panels, 700, 22).expand), [2, 1]);
  assert.deepEqual(arr(fitPanels(panels, 300, 22).expand), []);
});

test("fitPanels never re-expands a panel the user collapsed", () => {
  const panels = [P(200, 3), P(200, 2, { collapsed: true, auto: false, locked: true })];
  assert.deepEqual(arr(fitPanels(panels, 2000, 22).expand), []);
});
