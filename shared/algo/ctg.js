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

  // the bases
  for (const n of nodes) {
    if (n.point) { const it = items[n.firstItem]; n.px = it.x + it.w / 2; n.h = 12; continue; }
    const pad = padOf(n.level);
    n.x0 = items[n.firstItem].x - pad;
    n.x1 = items[n.lastItem].x + items[n.lastItem].w + pad;
  }
  for (const n of nodes) if (!n.point) n.h = o.baseH + o.stepH * (n.level - 1);
  // the apexes, parents before children
  let top = 0;
  for (const n of nodes) {
    if (n.point) { top = Math.max(top, n.h + o.labelH - 6); continue; }
    let ax = (n.x0 + n.x1) / 2;
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

// ── The split figure ──────────────────────────────────────────────────────────────────────────────────────────
// The pumping figure. The figure for one copy of the middle part (i = 1) is the frame: nested triangles over u v x y z on one
// base line. Every triangle has the same apex angle and the columns are equally wide (as wide as the widest part), so the
// triangles tile: the part by u is a strip of constant width between the legs of two triangles whose apexes are one step apart.
// Further copies of v … y are inlaid in the frame, each one step lower, in the same columns, so the frame keeps its shape; each
// copy has its own base line, and x is on that of the last. With no copy, v and y are gone, x hangs from the place of the
// first copy, and the root triangle has that place blanked out of it (a blank triangle over it).
// With opts.minWidth the figure is centred in that width (so that figures of different sizes share one axis).
// With opts.unify every triangle's legs are extended down to the lowest base line and the whole string stands on it: the same
// figure, extended; the apexes do not move.
//   fig: { root, up, rootIsUp, i, hops?, parts: { u, v, x, y, z: { text, label?, cls? } } }       text is ε for an empty string
//     hops: { top, mid }: the number of steps from the root to the first copy, and between two copies; a longer path than one
//     step is drawn jagged (default: all of them)
//   -> { width, height, cx, nodes: [{ sym, x, y, cls }], tris: [{ x0, x1, apex, ay, y, cls, tone?, blank? }],
//        tokens: [{ text, part, cls, x, w, y, label, eps }], base: [{ x0, x1, y }], jags: [{ from, to, jag }] }
//   tone: 0 for the first copy of the middle part, one more for each further copy; the shade follows it; the root has none
//   blank: the triangle to be drawn in the background colour over the root's
function ctgSplitLayout(fig, opts = {}) {
  const o = { charW: 9, tokPad: 6, minCol: 36, tan: 0.45, maxStep: 104, topPad: 26, marginX: 22, unify: false, ...opts };
  const i = fig.i, order = ["u", "v", "x", "y", "z"];
  const c = Math.max(o.minCol, ...order.map((p) => Math.max(1, fig.parts[p].text.length) * o.charW + 2 * o.tokPad));
  // a wide column makes the triangles flatter, not taller: the step down the spine is capped, and the angle follows from it
  const step = Math.min(c / o.tan, o.maxStep), tan = c / step, baseH = step / 2;
  const first = fig.rootIsUp ? 0 : 1; // the level of the first copy of the repeated nonterminal
  const lowJ = first + i;
  const apexY = (j) => o.topPad + 11 + j * step;
  const L0 = apexY(first + 1) + baseH; // the base line of the frame: that of one copy
  const lowBase = L0 + (i - 1) * step;
  const B = Math.max(L0, lowBase); // the lowest base line
  const half = (y, apex) => (y - apex) * tan;
  const unified = o.unify;
  const lastCopy = Math.max(i, 1);
  // the width is that of the unified figure in both modes, so that switching does not move anything
  const width = Math.max(o.minWidth || 0, 2 * o.marginX + Math.max(5 * c, 2 * half(B, apexY(0)) + (fig.rootIsUp ? 2 * c : 0)));
  const cx = width / 2;
  const nodes = [], tris = [], tokens = [], jags = [];
  const tok = (p, centre, level) => tokens.push({ text: fig.parts[p].text, part: p, cls: fig.parts[p].cls || "", label: fig.parts[p].label || "", x: centre - c / 2, w: c, y: level, eps: fig.parts[p].text === CTG_EPS });
  const tri = (apex, base, cls, tone) => ({ x0: cx - half(base, apex), x1: cx + half(base, apex), apex: cx, ay: apex, y: base, cls, tone });
  const node = (j, cls) => nodes.push({ sym: cls === "" ? fig.root : fig.up, x: cx, y: apexY(j) + 6, cls });
  // the triangles, outermost first
  if (!fig.rootIsUp) { node(0, ""); tris.push(tri(apexY(0), unified ? B : L0, "")); }
  for (let k = 1; k <= i; k++) { node(first + k - 1, "pp-up"); tris.push(tri(apexY(first + k - 1), unified ? B : L0 + (k - 1) * step, "pp-up", k - 1)); }
  if (i === 0 && !fig.rootIsUp && !unified) tris.splice(1, 0, { ...tri(apexY(first), L0, ""), blank: true });
  node(lowJ, "pp-low");
  tris.push(tri(apexY(lowJ), unified ? B : lowBase, "pp-low", 1));
  const real = tris.filter((t) => !t.blank);
  // the tokens
  if (!unified) {
    const col = (n) => cx + (n - 2) * c; // the centres of the five columns
    tok("u", col(0), L0);
    tok("z", col(4), L0);
    for (let k = 1; k <= i; k++) { tok("v", col(1), L0 + (k - 1) * step); tok("y", col(3), L0 + (k - 1) * step); }
    tok("x", col(2), lowBase);
  } else {
    // between the feet of two neighbouring triangles stands one part; outside the outermost one, u and z when the root is a copy
    const feet = real.map((t) => [t.x0, t.x1]);
    const isFrame = (k) => !fig.rootIsUp && k === 0;
    for (let k = 0; k + 1 < real.length; k++) {
      tok(isFrame(k) ? "u" : "v", (feet[k][0] + feet[k + 1][0]) / 2, B);
      tok(isFrame(k) ? "z" : "y", (feet[k][1] + feet[k + 1][1]) / 2, B);
    }
    if (fig.rootIsUp) { tok("u", feet[0][0] - c / 2, B); tok("z", feet[0][1] + c / 2, B); }
    tok("x", cx, B);
    // the order of the string, left to right
    tokens.sort((a, b) => a.x - b.x);
  }
  // the base lines: one when unified, else under the tokens of each level, where they touch
  const base = [];
  if (unified) base.push({ x0: Math.min(...tokens.map((t) => t.x)), x1: Math.max(...tokens.map((t) => t.x + t.w)), y: B });
  else {
    const sorted = [...tokens].sort((a, b) => a.y - b.y || a.x - b.x);
    let cur = null;
    for (const k of sorted) {
      if (cur && cur.y === k.y && k.x - cur.x1 < 1e-6) cur.x1 = k.x + k.w;
      else { cur = { x0: k.x, x1: k.x + k.w, y: k.y }; base.push(cur); }
    }
  }
  // the connections down the spine; jagged where steps are hidden
  const hops = fig.hops || { top: Infinity, mid: Infinity };
  for (let k = 1; k < nodes.length; k++) {
    const fromFrame = !fig.rootIsUp && k === 1;
    jags.push({ from: k - 1, to: k, jag: (fromFrame ? (i === 0 ? hops.top + hops.mid : hops.top) : hops.mid) > 1 });
  }
  return { width, height: B + 56, cx, nodes, tris, tokens, base, jags };
}
