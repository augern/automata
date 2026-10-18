// Shared dagre + d3 rendering of a state-transition graph, used by the NFA,
// PDA and TM tools. Requires d3 and dagre (loaded by the page).
//
// A page using prefix P provides <svg id="P-svg"><g id="P-graph-root"></g></svg>
// (usually inside a .ui-canvas), and optionally an element #P-graph-empty shown
// when there are no states. Arrow markers are created here (ids P-arrow and
// P-arrow-eps). Styling is the shared `ag-*` component in ui.css: nodes get
// ag-node + is-accepting / is-rejecting, edges ag-edge (+ ag-edge--eps), and
// highlightAutomatonStates() toggles is-active / is-dead.

// Zoom/pan on the svg, and fitting the graph to the view (see fit-view.js, which must be loaded
// first): fit() after every redrawing, on double-click and when the pane resizes while hasNodes()
// is true. Returns { fit, zoom }.
//
// The layout direction adapts to the pane: left-to-right or top-to-bottom, whichever lets the graph be drawn
// larger (see drawAutomatonGraph). When the pane is resized so that the other direction fits clearly better, the
// graph is laid out again: relayout() redraws it (a tool that marks states after drawing passes onRelayout, which
// redraws and marks them again).
// A graph is fitted to its pane and may be enlarged up to this factor (so small graphs fill the pane too).
const AG_MAX_SCALE = 1.8, AG_PAD_X = 28, AG_PAD_Y = 24;

function createGraphView(prefix, { hasNodes = () => true, onRelayout = null } = {}) {
  ensureArrowMarkers(d3.select("#" + prefix + "-svg"), prefix);
  const fv = createFitView({
    svg: prefix + "-svg", root: prefix + "-graph-root", scaleExtent: [0.1, 8],
    maxScale: AG_MAX_SCALE, padX: AG_PAD_X, padY: AG_PAD_Y, hasContent: hasNodes,
    sticky: false, // a redrawn definition is always fitted again
  });
  const view = { fit: fv.fit, zoom: fv.zoom, dir: null, spec: null };
  let timer = null;
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!view.spec || !hasNodes()) return;
        if (graphChooseDir(prefix, view, view.spec).dir === view.dir) return;
        if (onRelayout) onRelayout(); else drawAutomatonGraph(prefix, view, view.spec);
      }, 150);
    }).observe(document.getElementById(prefix + "-svg").parentElement);
  }
  return view;
}

// The dagre layout of a spec in one direction ("LR" or "TB").
function graphLayout(spec, dir) {
  const { nodes, edges, loops = [], radius: R = 16, ranksep = 64 } = spec;
  const dg = new dagre.graphlib.Graph();
  dg.setGraph({ rankdir: dir, nodesep: 36, ranksep, marginx: 50, marginy: 40 });
  dg.setDefaultEdgeLabel(() => ({}));
  // A state with a self-loop reserves room for the loop and its label (above it in left-to-right layouts, to its
  // right in top-to-bottom ones), so that other edges are routed around it. The box is symmetric: dagre centres it.
  const loopLabelW = new Map(loops.map((lp) => [lp.node, lp.labels.join(", ").length * 5.6]));
  for (let i = 0; i < nodes.length; i++) {
    let w = R * 2 + 4, h = R * 2 + 4;
    if (loopLabelW.has(i)) {
      const lw = loopLabelW.get(i);
      // dagre keeps edges about 28px from a box, so the box itself needs to reach only part of the way
      if (dir === "TB") w += 2 * (14 + lw);
      else { w = Math.max(w, lw + 8); h += 2 * 22; }
    }
    dg.setNode(i, { width: w, height: h });
  }
  for (const e of edges) dg.setEdge(e.from, e.to, {});
  dagre.layout(dg);
  return dg;
}

// dagre ends an edge on the border of the node's layout box, which is larger than the circle for a state that
// reserves room for a self-loop: move the ends onto the circles (towards the neighbouring point of the edge).
function clipToCircles(points, from, to, R) {
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  const clip = (i, j, c) => {
    const dx = pts[j].x - c.x, dy = pts[j].y - c.y, d = Math.hypot(dx, dy);
    if (d > R) { pts[i] = { x: c.x + (dx / d) * R, y: c.y + (dy / d) * R }; }
  };
  if (pts.length >= 2) {
    clip(0, 1, from);
    clip(pts.length - 1, pts.length - 2, to);
  }
  return pts;
}

// Which direction draws the graph larger in the pane? Both layouts are computed and compared by the scale at
// which they fit (capped like the fit itself). The current direction is
// kept unless the other is clearly better (15 %), so the graph does not flip back and forth while resizing.
// Returns { dir, dg } for the chosen direction (dg is null when no layout was needed).
function graphChooseDir(prefix, view, spec) {
  if (spec.rankdir) return { dir: spec.rankdir, dg: null };
  const svg = document.getElementById(prefix + "-svg");
  const vw = svg ? svg.clientWidth : 0, vh = svg ? svg.clientHeight : 0;
  const cur = view.dir || "LR";
  if (!vw || !vh || !spec.nodes.length) return { dir: cur, dg: null };
  const dgs = { LR: graphLayout(spec, "LR"), TB: graphLayout(spec, "TB") };
  const fitScale = (g) => Math.min(AG_MAX_SCALE, Math.max(vw - 2 * AG_PAD_X, 20) / Math.max((g.graph().width || 0) - 100, 1), Math.max(vh - 2 * AG_PAD_Y, 20) / Math.max((g.graph().height || 0) - 80, 1));
  const s = { LR: fitScale(dgs.LR), TB: fitScale(dgs.TB) };
  const other = cur === "LR" ? "TB" : "LR";
  const dir = view.dir && s[other] <= s[cur] * 1.15 ? cur : s[other] > s[cur] ? other : cur;
  return { dir, dg: dgs[dir] };
}

// <marker id="P-arrow"> and <marker id="P-arrow-eps"> in the svg's <defs> (idempotent).
function ensureArrowMarkers(svgSel, prefix) {
  if (!svgSel.select("defs").empty() && !svgSel.select("#" + prefix + "-arrow").empty()) return;
  const defs = svgSel.select("defs").empty() ? svgSel.insert("defs", ":first-child") : svgSel.select("defs");
  // userSpaceOnUse: the arrowhead keeps its size however thick its edge is drawn
  // (a highlighted edge must not get a bigger head).
  for (const kind of ["", "eps", "hot"]) {
    defs.append("marker")
      .attr("id", prefix + "-arrow" + (kind ? "-" + kind : ""))
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 8).attr("markerHeight", 6).attr("refX", 6.3).attr("refY", 2.7).attr("orient", "auto")
      .append("path").attr("d", "M0,0 L0,5.4 L7.2,2.7 z").attr("class", "ag-arrowhead" + (kind ? " ag-arrowhead--" + kind : ""));
  }
}

// Mark states (by index) as is-active / is-dead; clears the previous marks.
function highlightAutomatonStates(prefix, active = [], dead = []) {
  d3.selectAll("#" + prefix + "-graph-root .ag-node").classed("is-active", false).classed("is-dead", false);
  for (const i of active) d3.select("#" + prefix + "-state-" + i).classed("is-active", true);
  for (const i of dead) d3.select("#" + prefix + "-state-" + i).classed("is-dead", true);
}

// Lay out and draw the graph described by spec:
//   nodes: [{ label, accepting?, rejecting?, error? }]   (error: the error state, drawn with a cross)   (node i has id "P-state-i")
//   start: index of the start state
//   edges: [{ from, to, labels: string[], eps?: boolean, ids?: any[] }]   non-self edges, one per (from, to)
//   loops: [{ node, labels: string[], eps?: boolean, ids?: any[] }]       self-loops
//   onNodeHover: (stateIndex | null) => void   makes states hoverable (see setGraphNodeHot)
//   onHover: (ids | null) => void   makes edges hoverable. `ids` is parallel to `labels`
//     (one id per label, e.g. a rule number): hovering a label reports [its id], hovering
//     the edge itself reports all of the edge's ids, leaving reports null. Show the
//     result with setGraphHot(prefix, ids), which redraws the matching edges and labels
//     on top, highlighted.
//   radius (16), ranksep (64)
//   joinLabels: true → one line "a, b, c"; false → one stacked line per label
function drawAutomatonGraph(prefix, view, spec) {
  const { nodes, start, edges, loops = [], radius: R = 16, joinLabels = false, onHover, onNodeHover } = spec;
  const root = d3.select("#" + prefix + "-graph-root");
  root.selectAll("*").remove();

  const n = nodes.length;
  const emptyEl = document.getElementById(prefix + "-graph-empty");
  if (emptyEl) emptyEl.style.display = n === 0 ? "" : "none";
  if (n === 0) return;

  view.spec = spec;
  const chosen = graphChooseDir(prefix, view, spec);
  const dir = chosen.dir, TB = dir === "TB";
  view.dir = dir;
  const dg = chosen.dg || graphLayout(spec, dir);

  const arrowFor = (eps) => "url(#" + prefix + (eps ? "-arrow-eps" : "-arrow") + ")";
  const edgeClass = (eps) => "ag-edge" + (eps ? " ag-edge--eps" : "");

  // Label text: joined on one line, or one <text> per label stacked and centred on (x, y).
  // With ids, each stacked label remembers its id and the edge group reports hovers.
  // A label equal to the private-use wildcard (NFA_WILD, "any other symbol") is drawn as a red "?".
  const WILD = "\uE000";
  // `side`: the label sits to the right of its anchor point (top-to-bottom layouts, where edges run vertically).
  function addLabel(g, labels, x, y, ids, side = false) {
    const anchor = side ? "start" : "middle";
    if (joinLabels) {
      const t = g.append("text").attr("x", x).attr("y", y).attr("text-anchor", anchor);
      labels.forEach((lbl, li) => {
        if (li > 0) t.append("tspan").text(", ");
        if (lbl === WILD) t.append("tspan").attr("class", "ag-wild").text("?");
        else t.append("tspan").text(lbl);
      });
      return;
    }
    labels.forEach((lbl, li) => {
      const t = g.append("text").attr("x", x).attr("y", y - (labels.length - 1) * 5).attr("dy", li * 1.1 + "em").attr("text-anchor", anchor).classed("ag-wild", lbl === WILD).text(lbl === WILD ? "?" : lbl);
      if (ids) t.attr("data-k", li);
    });
  }
  // Hit targets for edges live in one layer under the nodes, so a generous hit area never
  // steals the pointer from a node. Each edge reports all its ids; each stacked label
  // reports its own.
  const hitLayer = root.insert("g", ":first-child").attr("class", "ag-hits");
  function makeHoverable(g, d, ids) {
    if (!ids || !onHover) return;
    g.node().__ids = ids;
    hitLayer.append("path").attr("class", "ag-hit").attr("d", d)
      .on("mouseenter", () => onHover(ids)).on("mouseleave", () => onHover(null));
    g.selectAll("text[data-k]")
      .on("mouseenter", function () { onHover([ids[+this.dataset.k]]); })
      .on("mouseleave", () => onHover(null));
  }

  const pathLine = d3.line().x((p) => p.x).y((p) => p.y).curve(d3.curveCatmullRom);

  for (const e of edges) {
    const ed = dg.edge(e.from, e.to);
    if (!ed) continue;
    const pts = clipToCircles(ed.points, dg.node(e.from), dg.node(e.to), R);
    const mid = pts[Math.floor(pts.length / 2)];
    const eg = root.append("g").attr("class", edgeClass(e.eps)).attr("data-edge", e.from + "-" + e.to);
    eg.append("path").attr("d", pathLine(pts));
    if (pts.length >= 2) {
      const p0 = pts[pts.length - 2], p1 = pts[pts.length - 1];
      eg.append("line")
        .attr("x1", p0.x).attr("y1", p0.y).attr("x2", p1.x).attr("y2", p1.y)
        .attr("stroke", "none").attr("marker-end", arrowFor(e.eps));
    }
    if (TB) addLabel(eg, e.labels, mid.x + 7, mid.y + 3, e.ids, true);
    else addLabel(eg, e.labels, mid.x, mid.y - (joinLabels ? 6 : 4), e.ids);
    makeHoverable(eg, pathLine(pts), e.ids);
  }

  // Nodes paint over the ends of the ordinary edges.
  for (let i = 0; i < n; i++) {
    const dn = dg.node(i);
    if (!dn) continue;
    const nd = nodes[i];
    let cls = "ag-node";
    if (nd.accepting) cls += " is-accepting";
    if (nd.rejecting || nd.error) cls += " is-rejecting";
    const ng = root.append("g").attr("class", cls).attr("id", prefix + "-state-" + i).attr("transform", `translate(${dn.x},${dn.y})`);
    if (onNodeHover) ng.on("mouseenter", () => onNodeHover(i)).on("mouseleave", () => onNodeHover(null));
    ng.append("circle").attr("r", R);
    if (nd.accepting) ng.append("circle").attr("class", "ag-ring").attr("r", R - 3);
    if (nd.rejecting) ng.append("circle").attr("class", "ag-ring").attr("r", R - 3);
    if (nd.error) {
      // The error state: two crossing bars inside the single circle, under the label.
      const k = R * Math.SQRT1_2;
      ng.append("line").attr("class", "ag-err-x").attr("x1", -k).attr("y1", -k).attr("x2", k).attr("y2", k);
      ng.append("line").attr("class", "ag-err-x").attr("x1", -k).attr("y1", k).attr("x2", k).attr("y2", -k);
    }
    ng.append("text").attr("class", "ag-label").attr("text-anchor", "middle").attr("dominant-baseline", "middle").text(nd.label);
    if (i === start) {
      root.append("line")
        .attr("class", "ag-start")
        .attr("x1", TB ? dn.x : dn.x - R - 18).attr("y1", TB ? dn.y - R - 18 : dn.y)
        .attr("x2", TB ? dn.x : dn.x - R - 1).attr("y2", TB ? dn.y - R - 1 : dn.y)
        .attr("marker-end", "url(#" + prefix + "-arrow)");
    }
  }

  // Self-loops are drawn after the nodes so their arrowheads sit on top of the node outline,
  // like the start arrow.
  for (const lp of loops) {
    const dn = dg.node(lp.node);
    if (!dn) continue;
    // Both ends sit exactly on the node's circle, symmetric about its top, so the
    // loop is attached to the node and the arrowhead touches it.
    // Left-to-right layouts put it above the node; top-to-bottom ones to the right, clear of the edges above and below.
    const a = Math.PI / 5; // 36° either side of straight up (or of straight right)
    const eg = root.append("g").attr("class", edgeClass(lp.eps)).attr("data-self", lp.node);
    let d;
    if (TB) {
      const xr = dn.x + R * Math.cos(a), dy = R * Math.sin(a);
      d = `M${xr},${dn.y - dy} C${xr + 36},${dn.y - dy - 10} ${xr + 36},${dn.y + dy + 10} ${xr},${dn.y + dy}`;
    } else {
      const dx = R * Math.sin(a), y0 = dn.y - R * Math.cos(a), cx = dn.x;
      d = `M${cx - dx},${y0} C${cx - dx - 10},${y0 - 36} ${cx + dx + 10},${y0 - 36} ${cx + dx},${y0}`;
    }
    eg.append("path").attr("d", d).attr("marker-end", arrowFor(lp.eps));
    if (TB) addLabel(eg, lp.labels, dn.x + R + 30, dn.y + 4, lp.ids, true);
    else addLabel(eg, lp.labels, dn.x, dn.y - R * Math.cos(a) - (joinLabels ? 38 : 40), lp.ids);
    makeHoverable(eg, d, lp.ids);
  }

  view.fit();
}

// Highlight graph edges and labels by id (see onHover in drawAutomatonGraph): copies of the
// matching edge paths and labels are drawn in a top layer, so a highlighted label stays
// readable where labels overlap. Pass null (or []) to clear.
function setGraphHot(prefix, ids) {
  const root = document.getElementById(prefix + "-graph-root");
  if (!root) return;
  const old = root.querySelector(":scope > .ag-hot");
  if (old) old.remove();
  if (!ids || !ids.length) return;
  const want = new Set(ids);
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  layer.setAttribute("class", "ag-hot");
  for (const g of root.querySelectorAll(".ag-edge")) {
    const edgeIds = g.__ids;
    if (!edgeIds || !edgeIds.some((id) => want.has(id))) continue;
    for (const el of g.children) {
      if (el.classList.contains("ag-hit")) continue;
      if (el.tagName === "text") {
        const k = el.dataset.k;
        if (k !== undefined && !want.has(edgeIds[+k])) continue;
      }
      const c = el.cloneNode(true);
      c.classList.add(el.tagName === "text" ? "ag-hot-label" : "ag-hot-path");
      if (c.hasAttribute("marker-end")) c.setAttribute("marker-end", "url(#" + prefix + "-arrow-hot)");
      layer.appendChild(c);
    }
  }
  root.appendChild(layer);
}

// Highlight one state of the graph (or none: null); see onNodeHover in drawAutomatonGraph.
function setGraphNodeHot(prefix, index) {
  d3.selectAll("#" + prefix + "-graph-root .ag-node").classed("is-hot", false);
  if (index !== null && index !== undefined) d3.select("#" + prefix + "-state-" + index).classed("is-hot", true);
}
