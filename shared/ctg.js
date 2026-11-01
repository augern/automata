// Draws a Christmas-tree graph (layout: algo/ctg.js) as a self-contained <svg>, sized to its content.
//
//   const { svg, layout } = drawCTG("host", tree, {
//     endMarker: true,                          // a $ after the string
//     marks: [{ leaf: 2, kind: "first", label: "FIRST" }],   // a token marked from below (by index, or leafId of a leaf object's id); kind: first | follow | focus
//     nodeKinds: { n3: "focus" },               // triangles drawn emphasised, by node id
//     spans: [{ node: "n3", label: "x" }, { from: 0, to: 1, label: "u" }],   // brackets under the line (a node's base, or leaves from..to)
//     scale: 1.5,                               // the drawing enlarged by this factor
//     title: (node, layout) => "text",          // tooltip of a triangle
//     ...layout options of ctgLayout
//   });
// The host is an element or an element id; its content is replaced. Triangles carry data-ctg="id", tokens data-leaf="i".

const CTG_KIND = { first: "ctg-k-first", follow: "ctg-k-follow", focus: "ctg-k-focus" };
const CTG_NS = "http://www.w3.org/2000/svg";

function drawCTG(host, tree, opts = {}) {
  const lay = ctgLayout(tree, opts);
  const hostEl = typeof host === "string" ? document.getElementById(host) : host;
  const make = (tag, attrs, parent, text) => {
    const e = document.createElementNS(CTG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  const kindCls = (k) => (CTG_KIND[k] ? " " + CTG_KIND[k] : "");

  const tokH = 22, markH = 18, spanH = 18;
  const marks = (opts.marks || []).map((m) => ({ ...m, leaf: m.leafId !== undefined ? lay.leafById[m.leafId] : m.leaf })).filter((m) => m.leaf >= 0 && m.leaf < lay.leaves.length);
  const spans = (opts.spans || []).map((s) => {
    const n = s.node !== undefined ? lay.byId[s.node] : null;
    if (n && n.empty) { // nothing to bracket: the stretch of its points, or the point itself
      const x0 = n.point ? n.px : n.x0, x1 = n.point ? n.px : n.x1;
      return { x0, x1, label: s.label, row: 0 };
    }
    const from = n ? n.first : s.from, to = n ? n.last : s.to;
    return { x0: lay.leaves[from].x, x1: lay.leaves[to].x + lay.leaves[to].w, label: s.label, row: 0 };
  });
  // overlapping brackets go on separate rows
  const rows = [];
  spans.sort((a, b) => a.x0 - b.x0).forEach((s) => {
    let r = rows.findIndex((end) => end < s.x0 - 4);
    if (r < 0) { r = rows.length; rows.push(0); }
    rows[r] = Math.max(s.x1, s.x0 + 8 * String(s.label || "").length);
    s.row = r;
  });

  // marks on one token stack their labels
  const perLeaf = {};
  for (const m of marks) m.row = perLeaf[m.leaf] = (perLeaf[m.leaf] === undefined ? 0 : perLeaf[m.leaf] + 1);
  const markRows = marks.length ? 1 + Math.max(...marks.map((m) => m.row)) : 0;
  const base = lay.top + 4;
  const height = base + tokH + markRows * markH + rows.length * spanH + 6;
  hostEl.innerHTML = "";
  const svg = make("svg", { class: "ctg", width: lay.width * (opts.scale || 1), height: height * (opts.scale || 1), viewBox: `0 0 ${lay.width} ${height}`, role: "img" }, hostEl);
  make("line", { class: "ctg-line", x1: 0, x2: lay.width, y1: base, y2: base }, svg);

  for (const n of lay.nodes) {
    const k = (opts.nodeKinds || {})[n.id];
    const g = make("g", { class: "ctg-node" + (n.empty ? " is-empty" : "") + (n.cls ? " " + n.cls : "") + kindCls(k), "data-ctg": n.id }, svg);
    if (opts.title) make("title", {}, g, opts.title(n, lay));
    if (n.point) {
      make("circle", { class: "ctg-point", cx: n.px, cy: base, r: 3.5 }, g);
      if (!opts.spine) make("text", { class: "ctg-sym", x: n.px, y: base - n.h, "text-anchor": "middle" }, g, n.sym);
      continue;
    }
    make("polygon", { class: "ctg-tri", points: `${n.x0},${base} ${n.ax},${base - n.h} ${n.x1},${base}` }, g);
    if (!opts.spine) make("text", { class: "ctg-sym", x: n.ax, y: base - n.h + 15, "text-anchor": "middle" }, g, n.sym);
  }
  if (opts.spine) drawCTGSpineNodes(svg, lay, base, make);

  for (const m of marks) {
    const l = lay.leaves[m.leaf];
    make("rect", { class: "ctg-tok-bg" + kindCls(m.kind), x: l.x, y: base + 2, width: l.w, height: tokH - 4, rx: 3 }, svg);
  }
  for (const l of lay.leaves) {
    make("text", { class: "ctg-tok" + (l.end ? " is-end" : "") + (l.cls ? " " + l.cls : ""), x: l.x + l.w / 2, y: base + 16, "text-anchor": "middle", "data-leaf": l.i }, svg, l.text);
  }
  for (const m of marks) {
    const l = lay.leaves[m.leaf], cx = l.x + l.w / 2, y = base + tokH + 2 + m.row * markH;
    const g = make("g", { class: "ctg-mark" + kindCls(m.kind) }, svg);
    make("path", { d: `M${cx - 4},${y + 6} L${cx},${y} L${cx + 4},${y + 6} Z` }, g);
    if (m.label) make("text", { x: cx + 8, y: y + 8 }, g, m.label);
  }
  const spanY = base + tokH + markRows * markH + 4;
  for (const s of spans) {
    const y = spanY + s.row * spanH;
    const g = make("g", { class: "ctg-span" }, svg);
    make("path", { d: `M${s.x0},${y - 4} V${y} H${s.x1} V${y - 4}` }, g);
    if (s.label) make("text", { x: (s.x0 + s.x1) / 2, y: y + 11, "text-anchor": "middle" }, g, s.label);
  }
  return { svg, layout: lay };
}

// The nodes of a spine figure over nested triangles: a bubble at each apex, joined to its parent's by a straight or jagged line.
function drawCTGSpineNodes(svg, lay, base, make) {
  const nodeH = 22;
  const at = (n) => (n.point ? { x: n.px, y: base - 30 } : { x: n.ax, y: base - n.h + 6 });
  for (const n of lay.nodes) {
    if (!n.parent) continue;
    const a = at(n.parent), b = at(n);
    const y0 = a.y + nodeH / 2, y1 = b.y - nodeH / 2;
    let d = `M${a.x},${y0}`;
    if (n.src.jag) {
      const steps = Math.max(2, Math.round((y1 - y0) / 9));
      for (let i = 1; i < steps; i++) d += ` L${a.x + (b.x - a.x) * (i / steps) + (i % 2 ? 5 : -5)},${y0 + ((y1 - y0) * i) / steps}`;
    }
    make("path", { class: "ctg-jag", d: d + ` L${b.x},${y1}` }, svg);
  }
  for (const n of lay.nodes) {
    const p = at(n), w = Math.max(26, String(n.sym).length * 8 + 14);
    const g = make("g", { class: "ctg-snode" + (n.cls ? " " + n.cls : "") }, svg);
    make("rect", { x: p.x - w / 2, y: p.y - nodeH / 2, width: w, height: nodeH, rx: nodeH / 2 }, g);
    make("text", { x: p.x, y: p.y + 4, "text-anchor": "middle" }, g, n.sym);
  }
}

// The spine figure over nested triangles on one base line, the string reading along it. spec as for ctgSpineTree.
function drawCTGPath(host, spec, opts = {}) {
  const { tree, parts, anchor } = ctgSpineTree(spec);
  const spans = parts.map((p, k) => ({ from: k, to: k, label: p.label })).filter((s, k) => s.label && s.label !== ctgLeafText(tree, k));
  return drawCTG(host, tree, { padStep: 4, minGap: 6, baseH: 46, stepH: 60, anchor, spine: true, spans, scale: opts.scale, title: opts.title });
}
function ctgLeafText(tree, k) {
  const out = [];
  (function walk(n) { for (const x of n.kids) { if (x.text !== undefined) out.push(x.text); else if (typeof x !== "string") walk(x); } })(tree);
  return out[k];
}

// The split figure of algo/ctg.js (ctgSplitLayout): the frame for one copy of the middle part, further copies poking down.
function drawCTGSplit(host, fig, opts = {}) {
  const lay = ctgSplitLayout(fig, opts);
  const hostEl = typeof host === "string" ? document.getElementById(host) : host;
  const make = (tag, attrs, parent, text) => {
    const e = document.createElementNS(CTG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  const sc = opts.scale || 1;
  hostEl.innerHTML = "";
  const svg = make("svg", { class: "ctg", width: lay.width * sc, height: lay.height * sc, viewBox: `0 0 ${lay.width} ${lay.height}`, role: "img" }, hostEl);
  for (const t of lay.tris) {
    if (t.blank) { make("polygon", { class: "ctg-blank", points: `${t.x0},${t.y + 2} ${t.apex},${t.ay} ${t.x1},${t.y + 2}` }, svg); continue; }
    // no outline: the shape is its tint, the base lines are what stands under the tokens
    const g = make("g", { class: "ctg-node" + (t.cls ? " " + t.cls : "") }, svg);
    const fill = make("polygon", { class: "ctg-tri-fill", points: `${t.x0},${t.y} ${t.apex},${t.ay} ${t.x1},${t.y}` }, g);
    if (t.hue !== undefined) fill.style.fill = ctgHue(t.hue, 0.4);
    for (const b of t.base) {
      const line = make("line", { class: "ctg-base", x1: b.x0, x2: b.x1, y1: t.y, y2: t.y }, g);
      if (t.hue !== undefined) line.style.stroke = ctgHue(t.hue, 0.9);
    }
  }
  for (const t of lay.tokens) {
    make("text", { class: "ctg-tok" + (t.cls ? " " + t.cls : "") + (t.eps ? " is-eps" : ""), x: t.x + t.w / 2, y: t.y + 16, "text-anchor": "middle" }, svg, t.text);
    if (t.label && t.label !== t.text) make("text", { class: "ctg-part", x: t.x + t.w / 2, y: t.y + 31, "text-anchor": "middle" }, svg, t.label);
  }
  const nodeH = 22;
  for (const j of lay.jags) {
    const a = lay.nodes[j.from], b = lay.nodes[j.to];
    const y0 = a.y + nodeH / 2, y1 = b.y - nodeH / 2, steps = Math.max(2, Math.round((y1 - y0) / 9));
    let d = `M${a.x},${y0}`;
    for (let i = 1; i < steps; i++) d += ` L${a.x + (i % 2 ? 5 : -5)},${y0 + ((y1 - y0) * i) / steps}`;
    make("path", { class: "ctg-jag", d: d + ` L${b.x},${y1}` }, svg);
  }
  for (const n of lay.nodes) {
    const w = Math.max(26, String(n.sym).length * 8 + 14);
    const g = make("g", { class: "ctg-snode" + (n.cls ? " " + n.cls : "") }, svg);
    const rect = make("rect", { x: n.x - w / 2, y: n.y - nodeH / 2, width: w, height: nodeH, rx: nodeH / 2 }, g);
    if (n.hue !== undefined) rect.style.stroke = ctgHue(n.hue, 1);
    make("text", { x: n.x, y: n.y + 4, "text-anchor": "middle" }, g, n.sym);
  }
  return { svg, layout: lay };
}

// A hue (degrees) as a colour that reads on a light and on a dark background.
const ctgHue = (h, alpha) => `hsl(${h} 75% 55% / ${alpha})`;
