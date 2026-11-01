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

test("ctgSpineTree: the spine as nested nodes, the string in order, the anchor the lowest node", () => {
  const part = (p) => ({ text: p, part: p, cls: "pp-" + p });
  const spec = { nodes: [{ sym: "S" }, { sym: "A" }, { sym: "A" }], segments: [{ left: part("u"), right: part("z"), jag: true }, { left: part("v"), right: part("y"), jag: false }], bottom: part("x") };
  const t = A.ctgSpineTree(spec);
  assert.deepEqual(js(t.parts.map((p) => p.part)), ["u", "v", "x", "y", "z"]);
  assert.equal(t.anchor, "s2");
  const lay = A.ctgLayout(t.tree, { padStep: 0, minGap: 10, anchor: t.anchor });
  assert.deepEqual(js(lay.leaves.map((l) => l.text)), ["u", "v", "x", "y", "z"]);
  const cx = (n) => n.ax;
  assert.ok(Math.abs(cx(lay.byId.s0) - cx(lay.byId.s2)) < 1e-6 && Math.abs(cx(lay.byId.s1) - cx(lay.byId.s2)) < 1e-6, "the apexes lie on one vertical line");
  assert.equal(lay.byId.s1.src.jag, true); // reached from S over the first, abstract stretch
  assert.equal(lay.byId.s2.src.jag, false);
});

test("split layout: the frame for i = 1, copies poke down one step each, no copy is a bite with x raised onto a bar", () => {
  const part = (p, text) => ({ text: text || p, label: p, cls: "pp-" + p });
  const fig = (i) => ({ root: "S", up: "A", rootIsUp: false, i, parts: { u: part("u"), v: part("v"), x: part("x"), y: part("y"), z: part("z") } });
  const one = A.ctgSplitLayout(fig(1)), two = A.ctgSplitLayout(fig(2)), none = A.ctgSplitLayout(fig(0)), three = A.ctgSplitLayout(fig(3));
  const lv = (lay, p) => lay.tokens.filter((t) => t.part === p).map((t) => t.y);
  const L0 = one.tokens[0].y;
  assert.equal(new Set(one.tokens.map((t) => t.y)).size, 1, "i = 1: one base line");
  assert.equal(one.tris[0].base.length, 1, "i = 1: the root triangle has a whole base");
  assert.equal(one.width, two.width, "the frame keeps its width");
  assert.equal(one.tris[0].y, two.tris[0].y, "the root triangle is the same");
  assert.deepEqual(js(lv(two, "v")), [L0, L0 + 60]);
  assert.equal(lv(two, "x")[0], L0 + 60, "x moves down with the last copy");
  assert.equal(Math.max(...lv(three, "x")), L0 + 120);
  assert.equal(two.tris[0].base.length, 2, "the base line is split where the copies poke down");
  // no copy: no v and y at all, x on a bar one step above the base line, a bite out of the root's base
  assert.deepEqual(js(none.tokens.map((t) => t.part).sort()), ["u", "x", "z"]);
  assert.deepEqual(js(lv(none, "x")), [L0 - 60]);
  assert.equal(none.tris[0].base.length, 2, "the root triangle keeps only its feet");
  assert.ok(none.tris[0].base[0].x1 < none.tris[0].base[1].x0);
  assert.equal(none.nodes.length, 2, "the root and the lowest node");
});

test("split layout, no copy: the bar runs between the legs of the root triangle at the height of x", () => {
  const part = (p) => ({ text: p, label: p, cls: "pp-" + p });
  const lay = A.ctgSplitLayout({ root: "S", up: "A", rootIsUp: false, i: 0, parts: { u: part("u"), v: part("v"), x: part("x"), y: part("y"), z: part("z") } });
  const r = lay.tris[0];
  assert.equal(r.bar.y, lay.tokens.find((t) => t.part === "x").y);
  assert.ok(r.bar.x0 > r.x0 && r.bar.x1 < r.x1 && r.bar.x0 < lay.cx && r.bar.x1 > lay.cx);
  assert.ok(Math.abs((lay.cx - r.bar.x0) - (r.bar.x1 - lay.cx)) < 1e-6, "symmetric about the spine");
});
