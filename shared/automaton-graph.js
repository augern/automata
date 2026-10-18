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
function createGraphView(prefix, { hasNodes = () => true } = {}) {
  ensureArrowMarkers(d3.select("#" + prefix + "-svg"), prefix);
  const view = createFitView({
    svg: prefix + "-svg", root: prefix + "-graph-root", scaleExtent: [0.1, 8],
    maxScale: 0.92, padX: 40, padY: 30, hasContent: hasNodes,
    sticky: false, // a redrawn definition is always fitted again
  });
  return { fit: view.fit, zoom: view.zoom };
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
//   nodes: [{ label, accepting?, rejecting? }]   (node i has id "P-state-i")
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
  const { nodes, start, edges, loops = [], radius: R = 16, ranksep = 64, joinLabels = false, onHover, onNodeHover } = spec;
  const root = d3.select("#" + prefix + "-graph-root");
  root.selectAll("*").remove();

  const n = nodes.length;
  const emptyEl = document.getElementById(prefix + "-graph-empty");
  if (emptyEl) emptyEl.style.display = n === 0 ? "" : "none";
  if (n === 0) return;

  const dg = new dagre.graphlib.Graph();
  dg.setGraph({ rankdir: "LR", nodesep: 36, ranksep, marginx: 50, marginy: 40 });
  dg.setDefaultEdgeLabel(() => ({}));
  for (let i = 0; i < n; i++) dg.setNode(i, { width: R * 2 + 4, height: R * 2 + 4 });
  for (const e of edges) dg.setEdge(e.from, e.to, {});
  dagre.layout(dg);

  const arrowFor = (eps) => "url(#" + prefix + (eps ? "-arrow-eps" : "-arrow") + ")";
  const edgeClass = (eps) => "ag-edge" + (eps ? " ag-edge--eps" : "");

  // Label text: joined on one line, or one <text> per label stacked and centred on (x, y).
  // With ids, each stacked label remembers its id and the edge group reports hovers.
  // A label equal to the private-use wildcard (NFA_WILD, "any other symbol") is drawn as a red-backed "?".
  const WILD = "\uE000";
  function addLabel(g, labels, x, y, ids) {
    if (joinLabels) {
      const t = g.append("text").attr("x", x).attr("y", y).attr("text-anchor", "middle");
      labels.forEach((lbl, li) => {
        if (li > 0) t.append("tspan").text(", ");
        if (lbl === WILD) t.append("tspan").attr("class", "ag-wild").text("?");
        else t.append("tspan").text(lbl);
      });
      return;
    }
    labels.forEach((lbl, li) => {
      const t = g.append("text").attr("x", x).attr("y", y - (labels.length - 1) * 5).attr("dy", li * 1.1 + "em").attr("text-anchor", "middle").classed("ag-wild", lbl === WILD).text(lbl === WILD ? "?" : lbl);
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
    const pts = ed.points;
    const mid = pts[Math.floor(pts.length / 2)];
    const eg = root.append("g").attr("class", edgeClass(e.eps)).attr("data-edge", e.from + "-" + e.to);
    eg.append("path").attr("d", pathLine(pts));
    if (pts.length >= 2) {
      const p0 = pts[pts.length - 2], p1 = pts[pts.length - 1];
      eg.append("line")
        .attr("x1", p0.x).attr("y1", p0.y).attr("x2", p1.x).attr("y2", p1.y)
        .attr("stroke", "none").attr("marker-end", arrowFor(e.eps));
    }
    addLabel(eg, e.labels, mid.x, mid.y - (joinLabels ? 6 : 4), e.ids);
    makeHoverable(eg, pathLine(pts), e.ids);
  }

  // Nodes paint over the ends of the ordinary edges.
  for (let i = 0; i < n; i++) {
    const dn = dg.node(i);
    if (!dn) continue;
    const nd = nodes[i];
    let cls = "ag-node";
    if (nd.accepting) cls += " is-accepting";
    if (nd.rejecting) cls += " is-rejecting";
    const ng = root.append("g").attr("class", cls).attr("id", prefix + "-state-" + i).attr("transform", `translate(${dn.x},${dn.y})`);
    if (onNodeHover) ng.on("mouseenter", () => onNodeHover(i)).on("mouseleave", () => onNodeHover(null));
    ng.append("circle").attr("r", R);
    if (nd.accepting) ng.append("circle").attr("class", "ag-ring").attr("r", R - 3);
    if (nd.rejecting) ng.append("circle").attr("class", "ag-ring").attr("r", R - 3);
    ng.append("text").attr("class", "ag-label").attr("text-anchor", "middle").attr("dominant-baseline", "middle").text(nd.label);
    if (i === start) {
      root.append("line")
        .attr("class", "ag-start")
        .attr("x1", dn.x - R - 18).attr("y1", dn.y).attr("x2", dn.x - R - 1).attr("y2", dn.y)
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
    const a = Math.PI / 5; // 36° either side of straight up
    const dx = R * Math.sin(a), y0 = dn.y - R * Math.cos(a), cx = dn.x;
    const eg = root.append("g").attr("class", edgeClass(lp.eps)).attr("data-self", lp.node);
    const d = `M${cx - dx},${y0} C${cx - dx - 10},${y0 - 36} ${cx + dx + 10},${y0 - 36} ${cx + dx},${y0}`;
    eg.append("path").attr("d", d).attr("marker-end", arrowFor(lp.eps));
    addLabel(eg, lp.labels, cx, y0 - (joinLabels ? 38 : 40), lp.ids);
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
