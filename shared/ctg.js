// Draws a Christmas-tree graph (layout: algo/ctg.js) as a self-contained <svg>, sized to its content.
//
//   const { svg, layout } = drawCTG("host", tree, {
//     endMarker: true,                          // a $ after the string
//     marks: [{ leaf: 2, kind: "first", label: "FIRST" }],   // a token marked from below; kind: first | follow | focus
//     nodeKinds: { n3: "focus" },               // triangles drawn emphasised, by node id
//     spans: [{ node: "n3", label: "x" }, { from: 0, to: 1, label: "u" }],   // brackets under the line (a node's base, or leaves from..to)
//     title: (node) => "text",                  // tooltip of a triangle
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
  const marks = (opts.marks || []).filter((m) => m.leaf >= 0 && m.leaf < lay.leaves.length);
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
  const svg = make("svg", { class: "ctg", width: lay.width, height, viewBox: `0 0 ${lay.width} ${height}`, role: "img" }, hostEl);
  make("line", { class: "ctg-line", x1: 0, x2: lay.width, y1: base, y2: base }, svg);

  for (const n of lay.nodes) {
    const k = (opts.nodeKinds || {})[n.id];
    const g = make("g", { class: "ctg-node" + (n.empty ? " is-empty" : "") + (n.cls ? " " + n.cls : "") + kindCls(k), "data-ctg": n.id }, svg);
    if (opts.title) make("title", {}, g, opts.title(n));
    if (n.point) {
      make("circle", { class: "ctg-point", cx: n.px, cy: base, r: 3.5 }, g);
      make("text", { class: "ctg-sym", x: n.px, y: base - n.h, "text-anchor": "middle" }, g, n.sym);
      continue;
    }
    make("polygon", { class: "ctg-tri", points: `${n.x0},${base} ${n.ax},${base - n.h} ${n.x1},${base}` }, g);
    make("text", { class: "ctg-sym", x: n.ax, y: base - n.h + 15, "text-anchor": "middle" }, g, n.sym);
  }

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
