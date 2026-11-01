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

// FIRST(E) ∋ id for E → T E′, T → F T′, F → id: the path E, T, F with nothing on the left and the rest on the right
const flank = (text, extra = {}) => ({ text, ...extra });
const firstSpec = () => ({
  nodes: [{ sym: "E" }, { sym: "T", jag: false }, { sym: "F", jag: false }],
  levels: [{ left: null, right: flank("+ id", { label: "E′" }) }, { left: null, right: flank("ε", { label: "T′" }) }],
  bottom: flank("id", { label: "F", kind: "first", mark: { kind: "first", label: "FIRST(E)" } }),
});

test("spine layout: the string reads along the base, outer levels first on the left, innermost first on the right", () => {
  const spec = { nodes: [{ sym: "S" }, { sym: "A" }, { sym: "B" }], levels: [{ left: flank("x"), right: flank("y") }, { left: flank("ε"), right: flank("z") }], bottom: flank("t") };
  const lay = A.ctgSpineLayout(spec);
  assert.deepEqual(js(lay.tokens.map((t) => t.text)), ["x", "ε", "t", "z", "y"]);
  assert.equal(new Set(lay.tokens.map((t) => t.y)).size, 1, "one base line");
  assert.equal(lay.base.length, 1);
  for (let k = 1; k < lay.tokens.length; k++) assert.ok(Math.abs(lay.tokens[k].x - (lay.tokens[k - 1].x + lay.tokens[k - 1].w)) < 1e-9, "the columns touch");
  assert.equal(lay.tokens[1].eps, true);
  assert.equal(new Set(lay.nodes.map((n) => n.x)).size, 1, "the spine is vertical");
  lay.nodes.forEach((n, k) => k && assert.ok(n.y > lay.nodes[k - 1].y));
});

test("spine layout: the triangles share one apex angle and tile, the feet are where the strips begin", () => {
  const lay = A.ctgSpineLayout(firstSpec());
  const slope = (t) => (t.x1 - t.x0) / 2 / (t.y - t.ay);
  for (const t of lay.tris) assert.ok(Math.abs(slope(t) - slope(lay.tris[0])) < 1e-9);
  for (let k = 0; k + 1 < lay.nodes.length; k++) {
    assert.ok(Math.abs((lay.nodes[k].footR - lay.nodes[k + 1].footR) - lay.c) < 1e-9, "a strip is one column wide");
    assert.ok(Math.abs((lay.nodes[k + 1].footL - lay.nodes[k].footL) - lay.c) < 1e-9);
  }
  assert.ok(Math.abs((lay.nodes[2].footR - lay.nodes[2].footL) - lay.c) < 1e-9, "the lowest triangle is one column wide");
});

test("spine layout: an empty column (null) has no token, the others keep their place", () => {
  const lay = A.ctgSpineLayout(firstSpec());
  assert.deepEqual(js(lay.tokens.map((t) => t.text)), ["id", "ε", "+ id"]);
  const id = lay.tokens[0];
  assert.ok(Math.abs(id.x + id.w / 2 - lay.cx) < 1e-9, "the bottom is centred on the spine");
  assert.equal(id.kind, "first");
  assert.deepEqual(js(id.mark), { kind: "first", label: "FIRST(E)" });
  assert.ok(A.ctgSpineLayout(firstSpec()).height > A.ctgSpineLayout({ ...firstSpec(), bottom: flank("id") }).height, "room for the pointer");
});

test("spine layout: connections are jagged where the node says so, outer strings stand outside the top triangle", () => {
  const spec = { nodes: [{ sym: "A" }, { sym: "B", jag: true }], levels: [{ left: flank("a"), right: flank("b") }], bottom: flank("c"), outer: { left: flank("ε"), right: flank("ε") } };
  const lay = A.ctgSpineLayout(spec);
  assert.deepEqual(js(lay.jags.map((j) => j.jag)), [true]);
  assert.deepEqual(js(lay.tokens.map((t) => t.text)), ["ε", "a", "c", "b", "ε"]);
  assert.ok(lay.tokens[0].x + lay.tokens[0].w <= lay.nodes[0].footL + 1e-9, "outside the top triangle");
  assert.ok(lay.tokens[4].x >= lay.nodes[0].footR - 1e-9);
});

test("spine layout: depth reserves room, a minimum width centres the figure on the same axis", () => {
  const deep = A.ctgSpineLayout(firstSpec(), { depth: 5 }), plain = A.ctgSpineLayout(firstSpec());
  assert.ok(deep.B > plain.B && deep.nodes[0].y === plain.nodes[0].y);
  const wide = A.ctgSpineLayout(firstSpec(), { minWidth: 800 });
  assert.equal(wide.width, 800);
  assert.equal(wide.cx, 400);
});

test("spine layout: a long string makes the triangles flatter, not taller", () => {
  const long = A.ctgSpineLayout({ ...firstSpec(), bottom: flank("a very long string indeed") });
  assert.ok(long.step <= 104 + 1e-9);
  const slope = (t) => (t.x1 - t.x0) / 2 / (t.y - t.ay);
  for (const t of long.tris) assert.ok(Math.abs(slope(t) - slope(long.tris[0])) < 1e-9);
});

test("spine layout: a side with several cells has a column for each, nearest the spine first, and the level is that many steps tall", () => {
  const spec = {
    nodes: [{ sym: "S" }, { sym: "A" }],
    levels: [{ left: [flank("a"), flank("ε")], right: [flank("b"), flank("ε"), flank("d")] }],
    bottom: flank("x"),
  };
  const lay = A.ctgSpineLayout(spec);
  assert.deepEqual(js(lay.tokens.map((t) => t.text)), ["a", "ε", "x", "b", "ε", "d"]);
  const x = lay.tokens[2];
  assert.ok(Math.abs(lay.tokens[1].x + lay.tokens[1].w - x.x) < 1e-9, "the last cell on the left touches the bottom");
  assert.ok(Math.abs(lay.tokens[3].x - (x.x + x.w)) < 1e-9, "the first cell on the right touches it too");
  const single = A.ctgSpineLayout({ ...spec, levels: [{ left: flank("a"), right: flank("b") }] });
  assert.ok(Math.abs((lay.nodes[1].y - lay.nodes[0].y) - 3 * (single.nodes[1].y - single.nodes[0].y)) < 1e-9, "three columns: three steps");
  // the triangles still tile: one angle, and the strip beside the legs is as wide as the columns it holds
  const slope = (t) => (t.x1 - t.x0) / 2 / (t.y - t.ay);
  assert.ok(Math.abs(slope(lay.tris[0]) - slope(lay.tris[1])) < 1e-9);
  assert.ok(Math.abs((lay.nodes[0].footR - lay.nodes[1].footR) - 3 * lay.c) < 1e-9);
});

test("spine layout: the shorter side of a level is padded on its outer end", () => {
  const spec = { nodes: [{ sym: "S" }, { sym: "A" }], levels: [{ left: flank("a"), right: [flank("b"), flank("c")] }], bottom: flank("x") };
  const lay = A.ctgSpineLayout(spec);
  assert.deepEqual(js(lay.tokens.map((t) => t.text)), ["a", "x", "b", "c"]);
  assert.ok(Math.abs(lay.tokens[1].x - (lay.tokens[0].x + lay.tokens[0].w)) < 1e-9, "the one cell on the left is next to the bottom");
  assert.ok(lay.tokens[0].x - lay.nodes[0].footL >= lay.c - 1e-9, "a blank column outside it");
});

test("spine layout: the label of a pointer fits inside the figure, which is widened on both sides to keep the spine in the middle", () => {
  const spec = { nodes: [{ sym: "S" }, { sym: "A" }], levels: [{ left: null, right: flank("ε") }], bottom: flank("d", { mark: { kind: "follow", label: "d ∈ FOLLOW(A) and a long label" } }) };
  const lay = A.ctgSpineLayout(spec);
  const d = lay.tokens.find((t) => t.text === "d");
  assert.ok(d.x + d.w / 2 + 8 + "d ∈ FOLLOW(A) and a long label".length * 6.4 <= lay.width, "the label ends inside");
  assert.ok(Math.abs(lay.cx - lay.width / 2) < 1e-9);
  const plain = A.ctgSpineLayout({ ...spec, bottom: flank("d") });
  assert.ok(lay.width > plain.width);
});

test("spine layout: triangles without a colour alternate two shades; a colour given is kept, \"\" is the page's own grey", () => {
  const spec = { nodes: [{ sym: "A" }, { sym: "B" }, { sym: "C" }, { sym: "D" }, { sym: "E", colour: "var(--accent)", tone: 1 }, { sym: "F", colour: "" }], levels: Array.from({ length: 5 }, () => ({ left: null, right: null })), bottom: flank("x") };
  const lay = A.ctgSpineLayout(spec);
  assert.deepEqual(js(lay.tris.slice(0, 4).map((t) => [t.colour, t.tone])), [["var(--text-lo)", 0], ["var(--text-lo)", 1], ["var(--text-lo)", 0], ["var(--text-lo)", 1]]);
  assert.deepEqual(js([lay.tris[4].colour, lay.tris[4].tone, lay.tris[5].colour]), ["var(--accent)", 1, ""]);
});
