const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const A = load("ctg.js");
const js = (x) => JSON.parse(JSON.stringify(x));
const tree = { sym: "S", kids: ["a", { sym: "A", id: "A1", kids: ["b", { sym: "A", id: "A2", kids: ["c"] }, "d"] }, "e"] };

test("tokens are laid out left to right on one line and each node knows its leaves", () => {
  const lay = A.ctgLayout(tree);
  assert.deepEqual(js(lay.leaves.map((l) => l.text)), ["a", "b", "c", "d", "e"]);
  for (let i = 1; i < lay.leaves.length; i++) assert.ok(lay.leaves[i].x >= lay.leaves[i - 1].x + lay.leaves[i - 1].w);
  assert.deepEqual([lay.byId.A1.first, lay.byId.A1.last], [1, 3]);
  assert.deepEqual([lay.byId.A2.first, lay.byId.A2.last], [2, 2]);
  assert.equal(A.ctgFirstLeaf(lay, "A1"), 1);
  assert.equal(A.ctgNextLeaf(lay, "A1"), 4);
});

test("an end marker is one more leaf after the string", () => {
  const lay = A.ctgLayout(tree, { endMarker: true });
  assert.equal(lay.leaves.length, 6);
  assert.equal(lay.leaves[5].end, true);
  assert.equal(A.ctgNextLeaf(lay, "n0"), 5); // the end marker follows the root
});

test("levels: a node is one higher than its highest child triangle", () => {
  const lay = A.ctgLayout(tree);
  assert.deepEqual([lay.byId.A2.level, lay.byId.A1.level, lay.byId.n0.level], [1, 2, 3]);
});

test("a triangle lies inside its parent: base, and apex between the parent's edges", () => {
  const lay = A.ctgLayout({ sym: "S", kids: [{ sym: "X", kids: ["a"] }, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", { sym: "Y", kids: [{ sym: "Z", kids: ["c"] }] }] });
  for (const n of lay.nodes) {
    const p = n.parent;
    if (!p) continue;
    assert.ok(n.x0 >= p.x0 && n.x1 <= p.x1, `${n.sym} base inside ${p.sym}`);
    assert.ok(n.h < p.h, `${n.sym} lower than ${p.sym}`);
    const t = n.h / p.h;
    assert.ok(n.ax >= p.x0 + (p.ax - p.x0) * t - 1e-9 && n.ax <= p.x1 - (p.x1 - p.ax) * t + 1e-9, `${n.sym} apex inside ${p.sym}`);
  }
});

test("neighbouring triangles do not overlap", () => {
  const lay = A.ctgLayout({ sym: "S", kids: [{ sym: "X", kids: [{ sym: "W", kids: ["a"] }] }, { sym: "Y", kids: [{ sym: "V", kids: ["b"] }] }] });
  assert.ok(lay.byId.n1.x1 < lay.byId.n3.x0);
});

test("an empty node is a point; its first leaf is the token after it", () => {
  const lay = A.ctgLayout({ sym: "S", kids: ["x", { sym: "N", id: "N", kids: [] }, "y"] });
  const n = lay.byId.N;
  assert.deepEqual([n.empty, n.point, n.level], [true, true, 0]);
  assert.equal(A.ctgFirstLeaf(lay, "N"), 1);
  assert.equal(A.ctgNextLeaf(lay, "N"), 1);
  assert.ok(n.px > lay.leaves[0].x + lay.leaves[0].w && n.px < lay.leaves[1].x);
});

test("an empty node over empty children is a triangle over their points", () => {
  const lay = A.ctgLayout({ sym: "S", kids: ["x", { sym: "B", id: "B", kids: [{ sym: "A", kids: [] }, { sym: "C", kids: [] }] }, "y"] });
  const b = lay.byId.B;
  assert.deepEqual([b.empty, b.point, b.level], [true, false, 1]);
  assert.ok(b.x1 > b.x0);
  assert.equal(A.ctgFirstLeaf(lay, "B"), 1);
});
