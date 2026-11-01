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

// ── The spine figure (Kozen's pumping pictures) ─────────────────────────────────────────────────────────────
// A path of nonterminals from the root down, drawn as a vertical spine; the stretches of the path that are not
// drawn node by node are jagged lines (an abstract derivation: A ⇒* vAy). The string derived to the left and to the
// right of each stretch hangs off the spine as a triangle (a flank), and the lowest node has a triangle of its own.
//   spec: { nodes: [{ sym, cls? }],                           the nodes on the spine, top to bottom
//           segments: [{ left, right, jag }],                 one between each two nodes; left/right: { text, part?, cls?, label? } or null
//           bottom: { text, part?, cls?, label? } }           what the last node derives
//   opts.mode "split": every flank has its own base line (the bases step down the spine) and the flanks of all segments
//                       share one column per side, so the width does not depend on the number of segments;
//             "joined": every flank reaches down to one lowest base line, the string reads left to right along it.
// -> { width, height, cx, base, nodes: [{ x, y, w, sym, cls }], flanks: [{ side, x0, x1, apex, y0, y1, text, ... }], segs: [{ y0, y1, jag }], bottom }
function ctgSpineLayout(spec, opts = {}) {
  const o = { charW: 9, tokPad: 8, gap: 12, colGap: 10, segH: 70, bottomH: 52, topPad: 24, marginX: 18, nodeH: 22, mode: "split", ...opts };
  const m = spec.segments.length;
  const wOf = (f) => (f && f.text ? Math.max(1, f.text.length) * o.charW + 2 * o.tokPad : 0);
  const wl = spec.segments.map((s) => wOf(s.left)), wr = spec.segments.map((s) => wOf(s.right));
  const nodeW = (n) => Math.max(26, String(n.sym).length * 8 + 14);
  const nodes = spec.nodes.map((n, k) => ({ sym: n.sym, cls: n.cls || "", y: o.topPad + o.nodeH / 2 + k * o.segH, w: nodeW(n), x: 0 }));
  const lastY = nodes[nodes.length - 1].y;
  const bw = Math.max(wOf(spec.bottom), 34);
  const base = lastY + o.nodeH / 2 + o.bottomH;
  const sum = (ws, from, to) => ws.slice(from, to).reduce((a, w) => a + w + o.colGap, 0);
  let cx, width;
  if (o.mode === "joined") cx = o.marginX + sum(wl, 0, m) + o.gap;
  else cx = o.marginX + Math.max(0, ...wl) + o.gap;
  const rightWidth = o.mode === "joined" ? sum(wr, 0, m) : Math.max(0, ...wr);
  width = Math.max(cx + o.gap + rightWidth + o.marginX, cx + bw / 2 + o.marginX);
  const flanks = [], segs = [];
  spec.segments.forEach((s, k) => {
    const y0 = nodes[k].y + o.nodeH / 2, y1 = nodes[k + 1].y - o.nodeH / 2;
    segs.push({ y0, y1, jag: !!s.jag });
    const baseY = o.mode === "joined" ? base : y1 + o.nodeH / 2;
    const add = (f, side, x0, w) => { if (f && f.text) flanks.push({ side, k, text: f.text, part: f.part || "", cls: f.cls || "", label: f.label || "", x0, x1: x0 + w, apex: cx, y0: nodes[k].y, y1: baseY }); };
    if (o.mode === "joined") {
      add(s.left, "left", o.marginX + sum(wl, 0, k), wl[k]);
      add(s.right, "right", cx + o.gap + sum(wr, k + 1, m), wr[k]);
    } else {
      add(s.left, "left", cx - o.gap - wl[k], wl[k]);
      add(s.right, "right", cx + o.gap, wr[k]);
    }
  });
  nodes.forEach((n) => { n.x = cx; });
  const bottom = { text: spec.bottom.text || "", part: spec.bottom.part || "", cls: spec.bottom.cls || "", label: spec.bottom.label || "", x0: cx - bw / 2, x1: cx + bw / 2, apex: cx, y0: lastY, y1: base, empty: !spec.bottom.text };
  return { width, height: base + 44, cx, base, nodes, flanks, segs, bottom, nodeH: o.nodeH, mode: o.mode };
}

// A spine spec (see ctgSpineLayout) as nested triangles: the tree of the path, each node holding the string to its left,
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
