// Pure: the layout of a "Christmas-tree graph" (CTG): an abstract parse tree drawn as nested triangles on one base line.
// A nonterminal is a triangle whose base is the stretch of the string it derives; a nonterminal that derives the empty
// string is a point on the line. No DOM access.
//
//   tree: { sym, id?, cls?, kids: [ node | "token" | { text, cls?, id? } ] }     (kids in left-to-right order)
//   ctgLayout(tree, opts) -> { width, top, leaves, nodes, byId, leafById }   leafById: leaf ids to indices; "end" is the end marker
//     leaves  [{ i, text, x, w, end, cls }]   the tokens on the base line; with opts.endMarker the last one is the end marker $
//     nodes   [{ id, sym, kids, parent, level, first, last, empty, point, x0, x1, ax, h, px, cls }]
//             first..last are the indices of the node's leaves; an empty node has last = first - 1, so `first` is the first
//             token seen after it and `last + 1` the same token seen as the one that follows it.
//             x0..x1 is the base, ax the apex x, h the apex height above the base line. point: an empty node with nothing under it
//             (not even empty children): drawn as a point at px; an empty node with empty children is a triangle over their points.
//     top     height above the base line that the drawing needs (the tallest apex and its label)
//   opts.anchor: id of a node; the apexes of it and of its ancestors are put over its centre where the parent allows
// Triangles nest: a triangle's base is wider than its children's by a margin that grows with its level, and its apex is
// kept inside the parent triangle, so a child never crosses an edge of its parent.

const CTG_EPS = "ε";

function ctgLayout(tree, opts = {}) {
  const o = { charW: 9, tokPad: 8, minGap: 14, padStep: 8, padMax: 40, baseH: 36, stepH: 28, marginX: 16, labelH: 20, endMarker: false, ...opts };
  const nodes = [], leaves = [], byId = {}, items = [], leafById = {};
  const padOf = (level) => Math.min(o.padStep * level, o.padMax);

  function walk(n, parent) {
    const node = { id: n.id !== undefined ? String(n.id) : "n" + nodes.length, sym: n.sym, src: n, kids: [], parent, cls: n.cls || "", level: 0, first: leaves.length, firstItem: items.length };
    nodes.push(node);
    byId[node.id] = node;
    for (const k of n.kids || []) {
      if (typeof k === "string" || k.text !== undefined) {
        const text = typeof k === "string" ? k : k.text;
        items.push({ leaf: leaves.length, w: Math.max(1, text.length) * o.charW + 2 * o.tokPad });
        if (typeof k !== "string" && k.id !== undefined) leafById[k.id] = leaves.length;
        leaves.push({ i: leaves.length, text, cls: typeof k === "string" ? "" : k.cls || "", end: false });
      } else node.kids.push(walk(k, node).id);
    }
    node.last = leaves.length - 1;
    node.empty = node.last < node.first;
    node.point = node.empty && items.length === node.firstItem; // nothing under it, not even a point of its own children
    if (node.point) items.push({ leaf: -1, w: Math.max(18, String(node.sym).length * o.charW + 6), node: node.id });
    node.lastItem = items.length - 1;
    node.level = node.point ? 0 : 1 + Math.max(0, ...node.kids.map((id) => byId[id].level));
    return node;
  }
  walk(tree, null);
  if (o.endMarker) {
    items.push({ leaf: leaves.length, w: o.charW + 2 * o.tokPad });
    leafById.end = leaves.length;
    leaves.push({ i: leaves.length, text: "$", cls: "", end: true });
  }

  // x positions: the gap between two items leaves room for the margins of the triangles that end and begin there
  const endPad = items.map(() => 0), startPad = items.map(() => 0);
  for (const n of nodes) {
    if (n.point) continue;
    const p = padOf(n.level);
    endPad[n.lastItem] = Math.max(endPad[n.lastItem], p);
    startPad[n.firstItem] = Math.max(startPad[n.firstItem], p);
  }
  let x = o.marginX + startPad[0];
  items.forEach((it, i) => {
    it.x = x;
    x += it.w + (i + 1 < items.length ? o.minGap + endPad[i] + startPad[i + 1] : 0);
  });
  const width = x + endPad[items.length - 1] + o.marginX;
  for (const it of items) if (it.leaf >= 0) { leaves[it.leaf].x = it.x; leaves[it.leaf].w = it.w; }

  // the apexes of the nodes above the anchor node lie over its centre, so the path down to it is a vertical line
  const anchor = opts.anchor !== undefined ? byId[opts.anchor] : null;
  const anchorX = anchor ? (items[anchor.firstItem].x + items[anchor.lastItem].x + items[anchor.lastItem].w) / 2 : 0;
  const above = new Set();
  for (let a = anchor; a; a = a.parent) above.add(a.id);

  // triangles, parents before children
  let top = 0;
  for (const n of nodes) {
    if (n.point) {
      const it = items[n.firstItem];
      n.px = it.x + it.w / 2;
      n.h = 12;
      top = Math.max(top, n.h + o.labelH - 6);
      continue;
    }
    const pad = padOf(n.level);
    n.x0 = items[n.firstItem].x - pad;
    n.x1 = items[n.lastItem].x + items[n.lastItem].w + pad;
    n.h = o.baseH + o.stepH * (n.level - 1);
    let ax = above.has(n.id) ? anchorX : (n.x0 + n.x1) / 2;
    const p = n.parent;
    if (p) {
      const t = n.h / p.h; // the parent's edges at this height
      const lo = p.x0 + (p.ax - p.x0) * t + 2, hi = p.x1 - (p.x1 - p.ax) * t - 2;
      if (lo <= hi) ax = Math.min(hi, Math.max(lo, ax));
    }
    n.ax = ax;
    top = Math.max(top, n.h + o.labelH);
  }
  return { width, top, leaves, nodes, byId, leafById };
}

// The leaf a node shows first: its own first token, or, when it is empty, the token after it. Past the last leaf: leaves.length.
const ctgFirstLeaf = (lay, id) => lay.byId[id].first;
// The leaf right after a node's stretch of the string.
const ctgNextLeaf = (lay, id) => lay.byId[id].last + 1;

// A spine spec { nodes: [{ sym, cls? }], segments: [{ left, right, jag }], bottom }, the nodes of the path with the strings
// { text, part?, cls?, label? } beside each stretch of it, as nested triangles: the tree of the path, each node holding the string to its left,
// the next node and the string to its right. -> { tree, parts, anchor } with the part letter of each token in order and the id
// of the lowest node; a node reached over an abstract stretch has jag: true.
function ctgSpineTree(spec) {
  const parts = [];
  const tok = (f) => { if (!f || !f.text) return []; parts.push({ part: f.part || "", label: f.label || "" }); return [{ text: f.text, cls: f.cls || "" }]; };
  const build = (k) => {
    const n = spec.nodes[k];
    if (k === spec.nodes.length - 1) return { sym: n.sym, id: "s" + k, cls: n.cls || "", jag: k > 0 && spec.segments[k - 1].jag, kids: tok(spec.bottom) };
    const seg = spec.segments[k];
    const left = tok(seg.left); // the order of the parts is the order of the tokens
    const child = build(k + 1);
    const right = tok(seg.right);
    return { sym: n.sym, id: "s" + k, cls: n.cls || "", jag: k > 0 && spec.segments[k - 1].jag, kids: [...left, child, ...right] };
  };
  const tree = build(0);
  return { tree, parts, anchor: "s" + (spec.nodes.length - 1) };
}

// ── The split figure ──────────────────────────────────────────────────────────────────────────────────────────
// The pumping figure with separate base lines. The figure for one copy of the middle part (i = 1) is the frame: nested
// triangles over u v x y z on one base line. Further copies of v … y are inlaid in it and poke down through the base line,
// each on a base line one step lower, in the same columns, so the frame keeps its shape. With no copy, v and y are gone, x is
// drawn as in the frame but anchored one step higher, at the place of the first copy; the root triangle is as in the frame
// with the place of the first copy blanked out of it (a blank triangle over it), so only the parts by u and z are left.
// A triangle's base is drawn only where tokens stand on it. With opts.tile all the triangles are similar and the columns equally
// wide, so that they tile without slivers or overlap (the strings are then centred in columns as wide as the longest).
//   fig: { root, up, rootIsUp, i, parts: { u, v, x, y, z: { text, label?, cls? } } }       text is ε for an empty string
//   -> { width, height, cx, nodes: [{ sym, x, y, cls }], tris: [{ x0, x1, apex, ay, y, cls, tone?, base: [{ x0, x1 }] }],
//   tone: 0 for the first copy of the middle part, one more for each further copy; the shade follows it (more saturated, more
//   contrast); the root has none
//        tokens: [{ text, part, cls, x, w, y, label, eps }], jags: [{ from, to }] }
//   with no copy there is a { blank: true } triangle over the place of the first copy, to be drawn in the background colour
function ctgSplitLayout(fig, opts = {}) {
  const o = { charW: 9, tokPad: 8, tokGap: 6, step: 60, baseH: 46, topPad: 26, marginX: 22, padRoot: 18, padUp: 9, padLow: 5, tile: false, tan: 0.45, ...opts };
  const i = fig.i;
  const order = ["u", "v", "x", "y", "z"];
  const w = {};
  for (const p of order) w[p] = Math.max(1, fig.parts[p].text.length) * o.charW + 2 * o.tokPad;
  if (o.tile) {
    // every triangle has the same apex angle and the columns are equally wide, so the triangles tile: the parts by u and z
    // are strips of constant width between the legs of the root triangle and those of the next one, and so on down
    const c = Math.max(36, ...order.map((p) => w[p]));
    for (const p of order) w[p] = c;
    Object.assign(o, { tokGap: 0, padRoot: 0, padUp: 0, padLow: 0, step: c / o.tan, baseH: c / o.tan / 2 });
  }
  const x0 = {};
  let x = o.marginX + o.padRoot;
  for (const p of order) { x0[p] = x; x += w[p] + o.tokGap; }
  const right = x - o.tokGap + o.padRoot + o.marginX;
  const cx = x0.x + w.x / 2;
  const first = fig.rootIsUp ? 0 : 1; // the node level of the first copy of the repeated nonterminal
  const lowJ = first + i;
  const apexY = (j) => o.topPad + 11 + j * o.step;
  const L0 = apexY(first + 1) + o.baseH; // the frame's base line: that of one copy
  const lowBase = L0 + (i - 1) * o.step;
  const nodes = [], tris = [], tokens = [], jags = [];
  const tok = (p, level) => tokens.push({ text: fig.parts[p].text, part: p, cls: fig.parts[p].cls || "", label: fig.parts[p].label || "", x: x0[p], w: w[p], y: level, eps: fig.parts[p].text === CTG_EPS });
  if (!fig.rootIsUp) {
    nodes.push({ sym: fig.root, x: cx, y: apexY(0) + 6, cls: "" });
    tris.push({ x0: x0.u - o.padRoot, x1: x0.z + w.z + o.padRoot, apex: cx, ay: apexY(0), y: L0, cls: "" });
  }
  tok("u", L0);
  tok("z", L0);
  for (let k = 1; k <= i; k++) {
    const j = first + k - 1, base = L0 + (k - 1) * o.step;
    nodes.push({ sym: fig.up, x: cx, y: apexY(j) + 6, cls: "pp-up" });
    tris.push({ x0: x0.v - o.padUp, x1: x0.y + w.y + o.padUp, apex: cx, ay: apexY(j), y: base, cls: "pp-up", tone: k - 1 }); // each copy a step further
    tok("v", base);
    tok("y", base);
  }
  // no copy: the place of the first copy is blanked out of the root triangle, which is otherwise as in the frame
  if (i === 0 && !fig.rootIsUp) tris.push({ blank: true, x0: x0.v - o.padUp, x1: x0.y + w.y + o.padUp, apex: cx, ay: apexY(first), y: L0 });
  nodes.push({ sym: fig.up, x: cx, y: apexY(lowJ) + 6, cls: "pp-low" });
  tris.push({ x0: x0.x - o.padLow, x1: x0.x + w.x + o.padLow, apex: cx, ay: apexY(lowJ), y: lowBase, cls: "pp-low", tone: 1 });
  tok("x", lowBase);
  for (let k = 1; k < nodes.length; k++) jags.push({ from: k - 1, to: k });
  // the base of each triangle: the stretches of its base line that have tokens on them, the outer ones reaching to its corners
  for (const t of tris) {
    if (t.blank) continue;
    const here = tokens.filter((k) => k.y === t.y && k.x >= t.x0 && k.x + k.w <= t.x1).sort((a, b) => a.x - b.x);
    t.base = [];
    for (const k of here) {
      const last = t.base[t.base.length - 1];
      if (last && k.x - last.x1 <= o.tokGap + 1) last.x1 = k.x + k.w;
      else t.base.push({ x0: k.x, x1: k.x + k.w });
    }
    if (t.base.length) {
      if (t.base[0].x0 - t.x0 <= o.padRoot) t.base[0].x0 = t.x0;
      const e = t.base[t.base.length - 1];
      if (t.x1 - e.x1 <= o.padRoot) e.x1 = t.x1;
    }
  }
  const lowest = Math.max(...tokens.map((t) => t.y));
  return { width: right, height: lowest + 50, cx, nodes, tris, tokens, jags };
}
