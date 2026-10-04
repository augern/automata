const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { panelDrag, panelWeights, fitPanels } = load("panels.js");
const P = (min, priority, extra = {}) => ({ min, priority, collapsed: false, auto: false, locked: false, ...extra });
const arr = (x) => Array.from(x);

test("panelDrag moves the boundary and keeps the pair's total width", () => {
  const r = panelDrag({ widthL: 300, widthR: 500, minL: 150, minR: 200, dx: 100 });
  assert.deepEqual({ ...r }, { left: 400, right: 400, collapse: null });
  assert.equal(r.left + r.right, 800);
});

test("panelDrag respects both minimums", () => {
  assert.deepEqual({ ...panelDrag({ widthL: 300, widthR: 500, minL: 150, minR: 200, dx: -999, canCollapseL: false }) }, { left: 150, right: 650, collapse: null });
  assert.deepEqual({ ...panelDrag({ widthL: 300, widthR: 500, minL: 150, minR: 200, dx: 999, canCollapseR: false }) }, { left: 600, right: 200, collapse: null });
});

test("panelDrag collapses a panel dragged far enough past its minimum", () => {
  const base = { widthL: 300, widthR: 500, minL: 150, minR: 200, collapsedW: 36 };
  // left min is 150: raw = 300-250 = 50, which is more than 48 below the minimum
  assert.deepEqual({ ...panelDrag({ ...base, dx: -250 }) }, { left: 36, right: 764, collapse: "left" });
  assert.equal(panelDrag({ ...base, dx: -180 }).collapse, null); // raw 120: within 48 of the minimum (150)
  assert.equal(panelDrag({ ...base, dx: -200 }).collapse, "left"); // raw 100: 50 below it
  assert.deepEqual({ ...panelDrag({ ...base, dx: 400 }) }, { left: 764, right: 36, collapse: "right" }); // raw 700 > 600+48
  assert.equal(panelDrag({ ...base, dx: 330 }).collapse, null); // raw 630: past the minimum, inside the threshold
});

test("panelDrag does not collapse a side that cannot collapse", () => {
  const base = { widthL: 300, widthR: 500, minL: 150, minR: 200, collapsedW: 36 };
  const r = panelDrag({ ...base, dx: -999, canCollapseL: false });
  assert.deepEqual({ ...r }, { left: 150, right: 650, collapse: null });
  assert.equal(panelDrag({ ...base, dx: 999, canCollapseR: false }).collapse, null);
});

test("panelDrag when the pair is already below its minimums does not invert", () => {
  const r = panelDrag({ widthL: 100, widthR: 100, minL: 150, minR: 150, dx: 20, canCollapseL: false, canCollapseR: false });
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

const { stepperKeyAction, nextKeyPanel } = load("panels.js");

test("stepperKeyAction maps arrows, comma/period, Home/End and t/T", () => {
  const act = (key, extra = {}) => stepperKeyAction({ key, ...extra });
  assert.equal(act("ArrowRight"), "step");
  assert.equal(act("."), "step");
  assert.equal(act("ArrowLeft"), "back");
  assert.equal(act(","), "back");
  assert.equal(act("Home"), "reset");
  assert.equal(act("End"), "end");
  assert.equal(act("t"), "next-panel");
  assert.equal(act("T", { shiftKey: true }), "prev-panel");
  assert.equal(act("x"), null);
  assert.equal(act("Enter"), null);
});

test("stepperKeyAction ignores shortcuts with Ctrl, Meta or Alt", () => {
  for (const mod of ["ctrlKey", "metaKey", "altKey"]) assert.equal(stepperKeyAction({ key: "ArrowRight", [mod]: true }), null, mod);
  // Shift alone is fine (Shift+arrow used to step the LL(1) table; now it steps the focused panel)
  assert.equal(stepperKeyAction({ key: "ArrowRight", shiftKey: true }), "step");
});

test("nextKeyPanel cycles in both directions and recovers from an unknown panel", () => {
  const ids = ["p-a", "p-b", "p-c"];
  assert.equal(nextKeyPanel(ids, "p-a", 1), "p-b");
  assert.equal(nextKeyPanel(ids, "p-c", 1), "p-a");
  assert.equal(nextKeyPanel(ids, "p-a", -1), "p-c");
  assert.equal(nextKeyPanel(ids, "gone", 1), "p-a");
  assert.equal(nextKeyPanel(["only"], "only", 1), "only");
  assert.equal(nextKeyPanel([], "x", 1), null);
});

const { soleOpenPanel } = load("panels.js");

test("soleOpenPanel returns the one open panel's id, else null", () => {
  assert.equal(soleOpenPanel([{ id: "a", collapsed: true }, { id: "b", collapsed: false }, { id: "c", collapsed: true }]), "b");
  assert.equal(soleOpenPanel([{ id: "a", collapsed: false }, { id: "b", collapsed: false }]), null);
  assert.equal(soleOpenPanel([{ id: "a", collapsed: true }]), null);
  assert.equal(soleOpenPanel([]), null);
});
