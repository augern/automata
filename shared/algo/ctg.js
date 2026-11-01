// Pure: the layout of a "Christmas-tree graph" (CTG): an abstract parse tree drawn as nested triangles on one base line.
// A nonterminal is a triangle whose base is the stretch of the string it derives; a nonterminal that derives the empty
// string is a point on the line. No DOM access.
//
//   tree: { sym, id?, cls?, kids: [ node | "token" | { text, cls? } ] }     (kids in left-to-right order)
//   ctgLayout(tree, opts) -> { width, top, leaves, nodes, byId }
//     leaves  [{ i, text, x, w, end, cls }]   the tokens on the base line; with opts.endMarker the last one is the end marker $
//     nodes   [{ id, sym, kids, parent, level, first, last, empty, point, x0, x1, ax, h, px, cls }]
//             first..last are the indices of the node's leaves; an empty node has last = first - 1, so `first` is the first
//             token seen after it and `last + 1` the same token seen as the one that follows it.
//             x0..x1 is the base, ax the apex x, h the apex height above the base line. point: an empty node with nothing under it
//             (not even empty children): drawn as a point at px; an empty node with empty children is a triangle over their points.
//     top     height above the base line that the drawing needs (the tallest apex and its label)
// Triangles nest: a triangle's base is wider than its children's by a margin that grows with its level, and its apex is
// kept inside the parent triangle, so a child never crosses an edge of its parent.

function ctgLayout(tree, opts = {}) {
  const o = { charW: 9, tokPad: 8, minGap: 14, padStep: 5, padMax: 24, baseH: 36, stepH: 28, marginX: 16, labelH: 20, endMarker: false, ...opts };
  const nodes = [], leaves = [], byId = {}, items = [];
  const padOf = (level) => Math.min(o.padStep * level, o.padMax);

  function walk(n, parent) {
    const node = { id: n.id !== undefined ? String(n.id) : "n" + nodes.length, sym: n.sym, kids: [], parent, cls: n.cls || "", level: 0, first: leaves.length, firstItem: items.length };
    nodes.push(node);
    byId[node.id] = node;
    for (const k of n.kids || []) {
      if (typeof k === "string" || k.text !== undefined) {
        const text = typeof k === "string" ? k : k.text;
        items.push({ leaf: leaves.length, w: Math.max(1, text.length) * o.charW + 2 * o.tokPad });
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
  return { width, top, leaves, nodes, byId };
}

// The leaf a node shows first: its own first token, or, when it is empty, the token after it. Past the last leaf: leaves.length.
const ctgFirstLeaf = (lay, id) => lay.byId[id].first;
// The leaf right after a node's stretch of the string.
const ctgNextLeaf = (lay, id) => lay.byId[id].last + 1;
