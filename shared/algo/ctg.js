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

// ── The spine figure ──────────────────────────────────────────────────────────────────────────────────────────
// A path of nonterminals from the top down, drawn as nested triangles on one base line with a vertical spine of nodes at their
// apexes. Between two neighbouring triangles the legs enclose one strip on each side; a strip is one column of the base line
// and holds the string that the symbols on that side derive. All triangles have the same apex angle and the columns are equally
// wide (as wide as the widest string), so the triangles tile. The string reads left to right along the base: the strips of the
// outer levels first, then the bottom, then the strips on the right from the innermost level out.
//   spec: { nodes: [{ sym, cls?, colour?, tone?, kind?, jag? }],      top to bottom; jag: the step from the node above hides steps
//           levels: [{ left, right }],                                one per pair of neighbouring nodes; a side is a flank, or an
//                                                                     array of them, one column each (a level with several columns
//                                                                     on a side is that many steps tall, the other side padded)
//           bottom: flank,                                            what the last node derives
//           outer?: { left, right },                                  strings outside the top triangle
//           arrows?: [{ fromNode, side: "left" | "right", toId }] }    a scan arrow from the foot of a node to the token with that id
//     flank: { text, id?, head?, label?, cls?, part?, kind?, mark? } or null (an empty column); text is ε for an empty string
//       head: the leading part of the text that is emphasised; id: what an arrow points at
//       label: the staple under the token (the symbols that derive it); kind: first | follow | focus highlights the token;
//       mark: { kind, label } is a pointer under the token
//     colour is a CSS colour for the triangle of the node, tone how much of it (default: a grey, deeper with each level; none for the top)
//   opts: depth (the base line is where a spine of that many nodes would have it, default: the spine's own), colWidth and
//         minWidth (at least that wide), and the constants below
//   -> { width, height, cx, B, c, step, nodes: [{ sym, x, y, cls, kind, footL, footR }], tris, tokens, base, jags, arrows }
//      footL and footR are where the legs of a node's triangle meet the base line
function ctgSpineLayout(spec, opts = {}) {
  const o = { charW: 9, tokPad: 6, minCol: 36, tan: 0.45, maxStep: 104, topPad: 26, marginX: 22, ...opts };
  const m = spec.nodes.length - 1;
  const cells = (f) => (f ? (Array.isArray(f) ? f : [f]) : []); // a strip is one flank or several, one column each
  const flanks = [...cells(spec.bottom), ...(spec.outer ? [...cells(spec.outer.left), ...cells(spec.outer.right)] : []), ...spec.levels.flatMap((l) => [...cells(l.left), ...cells(l.right)])];
  const c = Math.max(o.minCol, o.colWidth || 0, ...flanks.map((f) => Math.max(1, f.text.length) * o.charW + 2 * o.tokPad));
  // a wide column makes the triangles flatter, not taller: the step down the spine is capped, and the angle follows from it
  const step = Math.min(c / o.tan, o.maxStep), tan = c / step, baseH = step / 2;
  // a level with several columns on a side is that many steps tall, the strips on both sides as wide as the wider one
  const cols = spec.levels.map((l) => Math.max(1, cells(l.left).length, cells(l.right).length));
  const apex = [o.topPad + 11];
  for (let k = 0; k < m; k++) apex.push(apex[k] + cols[k] * step);
  const apexY = (k) => (k <= m ? apex[k] : apex[m] + (k - m) * step);
  const B = apexY(Math.max(m, o.depth || 0)) + baseH;
  const half = (k) => (B - apexY(k)) * tan;
  const width = Math.max(o.minWidth || 0, 2 * o.marginX + 2 * half(0) + (spec.outer ? 2 * c : 0));
  const cx = width / 2;
  const nodes = spec.nodes.map((n, k) => ({ sym: n.sym, x: cx, y: apexY(k) + 6, cls: n.cls || "", kind: n.kind || "", footL: cx - half(k), footR: cx + half(k) }));
  // a triangle without a colour of its own gets a grey that deepens with the depth, so that the nested ones can be told apart
  const tris = spec.nodes.map((n, k) => ({ x0: cx - half(k), x1: cx + half(k), apex: cx, ay: apexY(k), y: B, cls: n.cls || "", colour: n.colour || (k ? "var(--text-lo)" : ""), tone: n.tone !== undefined ? n.tone : k }));
  const tokens = [];
  const tok = (f, centre) => { tokens.push({ text: f.text, id: f.id, head: f.head || "", part: f.part || "", cls: f.cls || "", label: f.label || "", kind: f.kind || "", mark: f.mark || null, x: centre - c / 2, w: c, y: B, eps: f.text === CTG_EPS }); };
  for (let k = 0; k < m; k++) {
    // the cells stand next to the spine: on the left the last one is the nearest, on the right the first
    const left = cells(spec.levels[k].left), right = cells(spec.levels[k].right);
    left.forEach((f, i) => tok(f, nodes[k + 1].footL - (left.length - i - 0.5) * c));
    right.forEach((f, i) => tok(f, nodes[k + 1].footR + (i + 0.5) * c));
  }
  cells(spec.bottom).forEach((f) => tok(f, cx));
  if (spec.outer) {
    cells(spec.outer.left).forEach((f) => tok(f, nodes[0].footL - c / 2));
    cells(spec.outer.right).forEach((f) => tok(f, nodes[0].footR + c / 2));
  }
  tokens.sort((a, b) => a.x - b.x);
  const base = tokens.length ? [{ x0: tokens[0].x, x1: tokens[tokens.length - 1].x + c, y: B }] : [];
  const jags = [];
  for (let k = 1; k <= m; k++) jags.push({ from: k - 1, to: k, jag: !!spec.nodes[k].jag });
  const pointers = tokens.some((t) => t.mark) ? 30 : 0;
  // a pointer's label runs to the right of its token: make room for it, on both sides so that the spine stays in the middle
  const reach = Math.max(0, ...tokens.filter((t) => t.mark && t.mark.label).map((t) => t.x + t.w / 2 + 8 + t.mark.label.length * 6.4 + o.marginX - width));
  if (reach > 0 && !o.widened) return ctgSpineLayout(spec, { ...opts, minWidth: width + 2 * reach, widened: true });
  // a scan arrow runs along the base line from the foot of a node to a token, over the columns between
  const arrows = [];
  for (const a of spec.arrows || []) {
    const to = tokens.find((t) => t.id === a.toId);
    if (!to) continue;
    const right = a.side === "right";
    arrows.push({ x0: right ? nodes[a.fromNode].footR : nodes[a.fromNode].footL, x1: right ? to.x : to.x + to.w, y: B - 5, side: a.side, kind: to.kind });
  }
  return { width, height: B + 56 + pointers, cx, B, c, step, nodes, tris, tokens, base, jags, arrows };
}

// ── The split figure ──────────────────────────────────────────────────────────────────────────────────────────
// The pumping figure. The figure for one copy of the middle part (i = 1) is the frame: nested triangles over u v x y z on one
// base line. Every triangle has the same apex angle and the columns are equally wide (as wide as the widest part), so the
// triangles tile: the part by u is a strip of constant width between the legs of two triangles whose apexes are one step apart.
// Further copies of v … y are inlaid in the frame, each one step lower, in the same columns, so the frame keeps its shape; each
// copy has its own base line, and x is on that of the last. With no copy, v and y are gone, x hangs from the place of the
// first copy, and the root triangle has that place blanked out of it (a blank triangle over it).
// With opts.minWidth the figure is centred in that width (so that figures of different sizes share one axis).
// With opts.unify every triangle's legs are extended down to the lowest base line and the whole string stands on it: the same
// figure, extended; the apexes do not move. That figure is a spine figure (ctgSpineLayout) and is made by it.
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
  const first = fig.rootIsUp ? 0 : 1; // the level of the first copy of the repeated nonterminal
  const hops = fig.hops || { top: Infinity, mid: Infinity };
  const flank = (p) => ({ text: fig.parts[p].text, part: p, cls: fig.parts[p].cls || "", label: fig.parts[p].label || "" });
  // the width is that of the unified figure in both modes, so that switching does not move anything
  const unifiedWidth = (lay) => Math.max(o.minWidth || 0, 2 * o.marginX + 5 * c, lay);
  if (o.unify) {
    const nodes = [], levels = [];
    const jag = (k) => (!fig.rootIsUp && k === 1 ? (i === 0 ? hops.top + hops.mid : hops.top) : hops.mid) > 1; // the step into node k
    if (!fig.rootIsUp) nodes.push({ sym: fig.root });
    for (let k = 1; k <= i; k++) nodes.push({ sym: fig.up, cls: "pp-up", colour: "var(--hot)", tone: k - 1 });
    nodes.push({ sym: fig.up, cls: "pp-low", colour: "var(--accent)", tone: 1 });
    nodes.forEach((n, k) => { if (k) n.jag = jag(k); });
    for (let k = 0; k + 1 < nodes.length; k++) levels.push(!fig.rootIsUp && k === 0 ? { left: flank("u"), right: flank("z") } : { left: flank("v"), right: flank("y") });
    const spec = { nodes, levels, bottom: flank("x"), outer: fig.rootIsUp ? { left: flank("u"), right: flank("z") } : null };
    return ctgSpineLayout(spec, { ...o, colWidth: c, depth: first + Math.max(i, 1), minWidth: Math.max(o.minWidth || 0, 2 * o.marginX + 5 * c) });
  }
  // a wide column makes the triangles flatter, not taller: the step down the spine is capped, and the angle follows from it
  const step = Math.min(c / o.tan, o.maxStep), tan = c / step, baseH = step / 2;
  const lowJ = first + i;
  const apexY = (j) => o.topPad + 11 + j * step;
  const L0 = apexY(first + 1) + baseH; // the base line of the frame: that of one copy
  const lowBase = L0 + (i - 1) * step;
  const B = Math.max(L0, lowBase); // the lowest base line
  const half = (y, apex) => (y - apex) * tan;
  const width = unifiedWidth(2 * o.marginX + 2 * half(B, apexY(0)) + (fig.rootIsUp ? 2 * c : 0));
  const cx = width / 2;
  const nodes = [], tris = [], tokens = [], jags = [];
  const tok = (p, centre, level) => tokens.push({ text: fig.parts[p].text, part: p, cls: fig.parts[p].cls || "", label: fig.parts[p].label || "", x: centre - c / 2, w: c, y: level, eps: fig.parts[p].text === CTG_EPS });
  const tri = (apex, base, cls, tone, colour) => ({ x0: cx - half(base, apex), x1: cx + half(base, apex), apex: cx, ay: apex, y: base, cls, tone, colour });
  const node = (j, cls) => nodes.push({ sym: cls === "" ? fig.root : fig.up, x: cx, y: apexY(j) + 6, cls });
  // the triangles, outermost first
  if (!fig.rootIsUp) { node(0, ""); tris.push(tri(apexY(0), L0, "", 0, "")); }
  for (let k = 1; k <= i; k++) { node(first + k - 1, "pp-up"); tris.push(tri(apexY(first + k - 1), L0 + (k - 1) * step, "pp-up", k - 1, "var(--hot)")); }
  if (i === 0 && !fig.rootIsUp) tris.splice(1, 0, { ...tri(apexY(first), L0, "", 0, ""), blank: true });
  node(lowJ, "pp-low");
  tris.push(tri(apexY(lowJ), lowBase, "pp-low", 1, "var(--accent)"));
  const real = tris.filter((t) => !t.blank);
  const col = (n) => cx + (n - 2) * c; // the centres of the five columns
  tok("u", col(0), L0);
  tok("z", col(4), L0);
  for (let k = 1; k <= i; k++) { tok("v", col(1), L0 + (k - 1) * step); tok("y", col(3), L0 + (k - 1) * step); }
  tok("x", col(2), lowBase);
  // the base lines: under the tokens of each level, where they touch
  const base = [];
  const sorted = [...tokens].sort((a, b) => a.y - b.y || a.x - b.x);
  let cur = null;
  for (const k of sorted) {
    if (cur && cur.y === k.y && k.x - cur.x1 < 1e-6) cur.x1 = k.x + k.w;
    else { cur = { x0: k.x, x1: k.x + k.w, y: k.y }; base.push(cur); }
  }
  // the connections down the spine; jagged where steps are hidden
  for (let k = 1; k < nodes.length; k++) {
    const fromFrame = !fig.rootIsUp && k === 1;
    jags.push({ from: k - 1, to: k, jag: (fromFrame ? (i === 0 ? hops.top + hops.mid : hops.top) : hops.mid) > 1 });
  }
  return { width, height: B + 56, cx, nodes, tris, tokens, base, jags };
}

// A colour (a CSS colour or variable) as a tint on the page background, one step more saturated for each tone, with the steps
// shrinking so that the share of the colour approaches a limit (a percentage above 100 would be invalid, and the colour of a copy
// must not depend on how many copies there are). Built from the theme's tokens, so it follows the light and the dark theme.
// line: the stronger version for a base line.
function ctgTone(colour, tone, line) {
  const k = Math.pow(0.82, tone);
  return `color-mix(in srgb, ${colour} ${line ? 100 - 38 * k : 90 - 64 * k}%, var(--bg))`;
}
