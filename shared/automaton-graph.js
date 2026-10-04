// Shared dagre + d3 rendering of a state-transition graph, used by the NFA,
// PDA and TM tools. Requires d3 and dagre (loaded by the page).
//
// A page using prefix P provides <svg id="P-svg"><g id="P-graph-root"></g></svg>
// (usually inside a .ui-canvas), and optionally an element #P-graph-empty shown
// when there are no states. Arrow markers are created here (ids P-arrow and
// P-arrow-eps). Styling is the shared `ag-*` component in ui.css: nodes get
// ag-node + is-accepting / is-rejecting, edges ag-edge (+ ag-edge--eps), and
// highlightAutomatonStates() toggles is-active / is-dead.

// Zoom/pan on the svg, plus fit-to-view (double-click, and whenever the pane
// resizes while hasNodes() is true). Returns { fit, zoom }.
function createGraphView(prefix, { hasNodes = () => true, fallbackWidth = 340 } = {}) {
  const svgSel = d3.select("#" + prefix + "-svg");
  ensureArrowMarkers(svgSel, prefix);
  const zoom = d3.zoom()
    .scaleExtent([0.1, 8])
    .wheelDelta((e) => -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002))
    .on("zoom", (e) => d3.select("#" + prefix + "-graph-root").attr("transform", e.transform));
  svgSel.call(zoom).on("dblclick.zoom", null);

  function fit() {
    try {
      const bb = document.getElementById(prefix + "-graph-root").getBBox();
      const svgEl = document.getElementById(prefix + "-svg");
      const vw = svgEl.clientWidth || svgEl.parentElement.clientWidth || fallbackWidth;
      const vh = svgEl.clientHeight || svgEl.parentElement.clientHeight || 300;
      if (!bb || bb.width < 1 || bb.height < 1) return;
      const sc = Math.min(0.92, Math.min(vw / (bb.width + 80), vh / (bb.height + 60)));
      const tx = (vw - bb.width * sc) / 2 - bb.x * sc;
      const ty = (vh - bb.height * sc) / 2 - bb.y * sc;
      svgSel.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(sc));
    } catch (e) {
      /* ignore: element not laid out yet */
    }
  }

  document.getElementById(prefix + "-svg").addEventListener("dblclick", fit);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => { if (hasNodes()) fit(); }).observe(document.getElementById(prefix + "-svg").parentElement);
  }
  return { fit, zoom };
}

// <marker id="P-arrow"> and <marker id="P-arrow-eps"> in the svg's <defs> (idempotent).
function ensureArrowMarkers(svgSel, prefix) {
  if (!svgSel.select("defs").empty() && !svgSel.select("#" + prefix + "-arrow").empty()) return;
  const defs = svgSel.select("defs").empty() ? svgSel.insert("defs", ":first-child") : svgSel.select("defs");
  for (const eps of [false, true]) {
    defs.append("marker")
      .attr("id", prefix + (eps ? "-arrow-eps" : "-arrow"))
      .attr("markerWidth", 8).attr("markerHeight", 8).attr("refX", 7).attr("refY", 3).attr("orient", "auto")
      .append("path").attr("d", "M0,0 L0,6 L8,3 z").attr("class", "ag-arrowhead" + (eps ? " ag-arrowhead--eps" : ""));
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
//   edges: [{ from, to, labels: string[], eps?: boolean }]   non-self edges, one per (from, to)
//   loops: [{ node, labels: string[], eps?: boolean }]       self-loops
//   radius (16), ranksep (64)
//   joinLabels: true → one line "a, b, c"; false → one stacked line per label
function drawAutomatonGraph(prefix, view, spec) {
  const { nodes, start, edges, loops = [], radius: R = 16, ranksep = 64, joinLabels = false } = spec;
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

  // Label text: joined on one line, or stacked tspans centred on (x, y).
  function addLabel(g, labels, x, y) {
    if (joinLabels) {
      g.append("text").attr("x", x).attr("y", y).attr("text-anchor", "middle").text(labels.join(", "));
      return;
    }
    const textEl = g.append("text").attr("x", x).attr("y", y - (labels.length - 1) * 5).attr("text-anchor", "middle");
    labels.forEach((lbl, li) => {
      textEl.append("tspan").attr("x", x).attr("dy", li === 0 ? 0 : "1.1em").text(lbl);
    });
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
    addLabel(eg, e.labels, mid.x, mid.y - (joinLabels ? 6 : 4));
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
    eg.append("path")
      .attr("d", `M${cx - dx},${y0} C${cx - dx - 10},${y0 - 36} ${cx + dx + 10},${y0 - 36} ${cx + dx},${y0}`)
      .attr("marker-end", arrowFor(lp.eps));
    addLabel(eg, lp.labels, cx, y0 - (joinLabels ? 38 : 40));
  }

  view.fit();
}
