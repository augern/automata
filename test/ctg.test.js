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

const figure = (i, extra = {}) => {
  const part = (p, text) => ({ text: text || p, label: p, cls: "pp-" + p });
  return { root: "S", up: "A", rootIsUp: false, i, parts: { u: part("u"), v: part("v"), x: part("x"), y: part("y"), z: part("z") }, ...extra };
};

test("split layout: all triangles have one apex angle and the strips beside the legs have constant width", () => {
  for (const i of [0, 1, 2, 3]) for (const unify of [false, true]) {
    const lay = A.ctgSplitLayout(figure(i), { unify });
    const tris = lay.tris.filter((t) => !t.blank);
    const slope = (t) => (t.x1 - t.x0) / 2 / (t.y - t.ay);
    for (const t of tris) assert.ok(Math.abs(slope(t) - slope(tris[0])) < 1e-9, `i = ${i}: the same angle`);
  }
  const [s, a, low] = A.ctgSplitLayout(figure(1)).tris;
  const t = (s.x1 - s.x0) / 2 / (s.y - s.ay);
  assert.ok(Math.abs((a.x0 - s.x0) - (a.ay - s.ay) * t) < 1e-9, "u: the width of the strip is what the offset of the legs gives");
  assert.ok(Math.abs((low.x0 - a.x0) - (low.ay - a.ay) * t) < 1e-9, "v: the same one level down");
  assert.ok(Math.abs((a.x0 - s.x0) - (s.x1 - a.x1)) < 1e-9, "u and z equally wide");
});

test("split layout: the frame for i = 1, copies poke down one step each, no copy blanks out the first copy", () => {
  const one = A.ctgSplitLayout(figure(1)), two = A.ctgSplitLayout(figure(2)), none = A.ctgSplitLayout(figure(0)), three = A.ctgSplitLayout(figure(3));
  const lv = (lay, p) => lay.tokens.filter((t) => t.part === p).map((t) => t.y);
  const L0 = one.tokens[0].y, step = two.tris[2].ay - two.tris[1].ay;
  assert.equal(new Set(one.tokens.map((t) => t.y)).size, 1, "i = 1: one base line");
  assert.equal(one.base.length, 1);
  assert.equal(one.tris[0].x0 - one.cx, two.tris[0].x0 - two.cx, "the frame keeps its shape");
  assert.equal(one.tris[0].y, two.tris[0].y, "the root triangle is the same");
  assert.deepEqual(js(lv(two, "v")), [L0, L0 + step]);
  assert.equal(lv(two, "x")[0], L0 + step, "x moves down with the last copy");
  assert.equal(Math.max(...lv(three, "x")), L0 + 2 * step);
  assert.ok(two.base.length > one.base.length, "the base line is split where the copies poke down");
  assert.deepEqual(js(none.tokens.map((t) => t.part).sort()), ["u", "x", "z"]);
  assert.equal(lv(none, "x")[0], L0 - step, "x is raised to where the first copy hangs");
  assert.equal(none.tris[0].x0, one.tris[0].x0, "the root triangle is the same");
  assert.equal(none.tris.find((t) => t.blank).ay, one.tris[1].ay, "the blank triangle is where the first copy is in the frame");
  assert.equal(none.nodes.length, 2, "the root and the lowest node");
});

test("split layout, unified: the same apexes, the legs extended to one base line, the string on it in order", () => {
  for (const i of [0, 1, 2, 3]) {
    const split = A.ctgSplitLayout(figure(i)), uni = A.ctgSplitLayout(figure(i), { unify: true });
    assert.deepEqual(js(uni.nodes.map((n) => [n.sym, n.y, n.cls])), js(split.nodes.map((n) => [n.sym, n.y, n.cls])), `i = ${i}: the nodes keep their heights`);
    const real = (lay) => lay.tris.filter((t) => !t.blank);
    real(split).forEach((t, k) => assert.equal(real(uni)[k].ay, t.ay));
    assert.equal(uni.base.length, 1);
    assert.equal(new Set(uni.tokens.map((t) => t.y)).size, 1, "one base line");
    assert.equal(uni.height, split.height, "the same height");
    assert.equal(uni.width, split.width, "the same width, so that the apexes stay where they are");
    assert.equal(uni.cx, split.cx);
  }
  const uni = A.ctgSplitLayout(figure(2), { unify: true });
  assert.equal(uni.tokens.map((t) => t.part).join(""), "uvvxyyz", "the string, left to right");
  for (let k = 1; k < uni.tokens.length; k++) assert.ok(uni.tokens[k].x >= uni.tokens[k - 1].x + uni.tokens[k - 1].w - 1e-6, "no overlap");
  // i = 1 is the frame in both modes: the same tokens in the same places
  const f1 = A.ctgSplitLayout(figure(1)), u1 = A.ctgSplitLayout(figure(1), { unify: true });
  const key = (lay) => lay.tokens.map((t) => [t.part, Math.round(t.x), t.y].join(":")).sort().join(" ");
  assert.equal(key(u1), key(f1));
});

test("split layout: a connection is jagged only where it hides steps", () => {
  const jag = (hops, i = 2) => A.ctgSplitLayout(figure(i, { hops })).jags.map((j) => j.jag);
  assert.deepEqual(js(jag({ top: 1, mid: 1 })), [false, false, false]);
  assert.deepEqual(js(jag({ top: 3, mid: 1 })), [true, false, false]);
  assert.deepEqual(js(jag({ top: 1, mid: 2 })), [false, true, true]);
  assert.deepEqual(js(jag({ top: 1, mid: 1 }, 0)), [true], "no copy: the root reaches the lowest node over both steps");
  assert.deepEqual(js(A.ctgSplitLayout(figure(1)).jags.map((j) => j.jag)), [true, true], "the general case hides steps everywhere");
  assert.deepEqual(js(jag({ top: 1, mid: 1 }, 1)), [false, false]);
});

test("split layout: with a minimum width the figure is centred in it, so figures of different sizes share one axis", () => {
  const wide = A.ctgSplitLayout(figure(4), { unify: true });
  for (const i of [0, 1, 2, 3, 4]) {
    const lay = A.ctgSplitLayout(figure(i), { minWidth: wide.width });
    assert.equal(lay.width, wide.width);
    assert.equal(lay.cx, wide.cx);
    assert.equal(lay.height >= 0, true);
  }
});

test("ctgTone: the share of the colour grows with the tone and stays a valid percentage", () => {
  const share = (tone, line) => +A.ctgTone("var(--hot)", tone, line).match(/ ([\d.]+)%/)[1];
  for (const line of [false, true]) {
    let last = 0;
    for (let tone = 0; tone <= 60; tone++) {
      const s = share(tone, line);
      assert.ok(s > last && s <= 100, `tone ${tone}: ${s}`);
      last = s;
    }
  }
});
