// The derivation graph view (see derivGraph in algo/derivation.js): for the grammars whose derivations are not trees. A step is a box
// between two rows: the symbols of the left side of its rule end there, the ones of the right side start under it (a symbol on both
// sides is made again). A symbol is drawn once, in its lane and in the row of the step that made it, with a long line down to the box of
// the step that rewrites it. The symbols still in the form are the leaves: they are on the bottom line, with a long line from the box
// that made them. Needs d3, shared.js (TR, treeNodeW), fit-view.js and shared.css (.dag-*).
//
//   const view = createDerivGraph({ svg: "graph-svg", root: "graph-root" });
//   view.draw(model, grammar);   model: derivGraph(grammar, steps)
//   view.clear();
// A node has data-node="id", a box data-node="s<step>" and data-prod="<production number>", the links of the other panels.
function createDerivGraph(spec) {
  let has = false;
  const view = createFitView({ svg: spec.svg, root: spec.root, scaleExtent: [0.08, 8], maxScale: 0.95, pad: 24, hasContent: () => has });
  const ROW = 96, BOX_H = 22;

  return {
    clear() {
      d3.select("#" + spec.root).selectAll("*").remove();
      has = false;
    },
    draw(model, grammar) {
      const svg = d3.select("#" + spec.svg), root = d3.select("#" + spec.root);
      root.selectAll("*").remove();
      has = true;
      if (svg.select("#graph-read-arrow").empty()) { // the reading order of the leaves, as the tree's baseline has
        (svg.select("defs").empty() ? svg.insert("defs", ":first-child") : svg.select("defs")).append("marker")
          .attr("id", "graph-read-arrow").attr("markerUnits", "userSpaceOnUse").attr("markerWidth", 10).attr("markerHeight", 8)
          .attr("refX", 8).attr("refY", 4).attr("orient", "auto")
          .append("path").attr("d", "M0,0 L9,4 L0,8 z").attr("fill", "var(--text-lo)");
      }
      const nodes = new Map(model.nodes.map((n) => [n.id, n]));
      const pitch = Math.max(36, ...model.nodes.map((n) => treeNodeW(n.symbol))) + 8;
      const last = model.rows.length - 1, bottom = last * ROW;
      const X = (n) => n.lane * pitch;
      const Y = (n) => (n.died === null ? bottom : n.born * ROW); // a leaf is on the bottom line
      const boxTop = (step) => (step - 1) * ROW + ROW / 2 - BOX_H / 2;
      const g = root.append("g");

      // the lines first, then the boxes and the nodes over them
      for (const n of model.nodes) {
        if (n.died !== null) g.append("line").attr("class", "tree-edge").attr("x1", X(n)).attr("y1", Y(n) + TR).attr("x2", X(n)).attr("y2", boxTop(n.died));
      }
      for (const box of model.boxes) {
        const ins = box.inputs.map((id) => X(nodes.get(id))), lo = Math.min(...ins), hi = Math.max(...ins), from = boxTop(box.step) + BOX_H;
        for (const id of box.outputs) { // from the box to what it made, kept inside what it rewrote; to a leaf the line is long
          const o = nodes.get(id), ax = Math.max(lo, Math.min(hi, X(o)));
          g.append("path").attr("class", "tree-edge").attr("d", `M ${ax},${from} L ${X(o)},${Math.min(from + 14, Y(o) - TR)} L ${X(o)},${Y(o) - TR}`);
        }
      }
      for (const box of model.boxes) {
        const r = box.step, xs = box.inputs.map((id) => X(nodes.get(id)));
        const x1 = Math.min(...xs) - pitch / 2 + 4, x2 = Math.max(...xs) + pitch / 2 - 4, top = boxTop(r);
        const bg = g.append("g").attr("class", "dag-box").attr("data-node", "s" + r).attr("data-prod", box.ruleIdx + 1).attr("transform", `translate(${x1},${top})`);
        bg.append("rect").attr("width", x2 - x1).attr("height", BOX_H).attr("rx", 5);
        bg.append("text").attr("x", (x2 - x1) / 2).attr("y", BOX_H / 2).text("r" + (box.ruleIdx + 1));
        const bd = bg.append("g").attr("class", "tree-badge").attr("transform", "translate(2,0)");
        bd.append("circle").attr("r", 6 + (String(r).length - 1) * 2);
        bd.append("text").attr("dy", "0.35em").text(r);
        if (!box.outputs.length) g.append("text").attr("class", "dag-eps").attr("x", (x1 + x2) / 2).attr("y", top + BOX_H + 14).text("ε");
      }
      for (const n of model.nodes) {
        const isTerm = !grammar.nonterminals.has(n.symbol);
        const ng = g.append("g").attr("class", "tree-node" + (isTerm ? " terminal" : "") + (n.born === last && last > 0 ? " new-node" : ""))
          .attr("data-node", n.id).attr("transform", `translate(${X(n)},${Y(n)})`);
        const w = treeNodeW(n.symbol);
        ng.append("rect").attr("class", "tn-shape").attr("x", -w / 2).attr("y", -TR).attr("width", w).attr("height", 2 * TR).attr("rx", TR);
        ng.append("text").text(n.symbol);
      }

      // the dashed line under the leaves, with the reading order
      const leaves = model.nodes.filter((n) => n.died === null);
      g.append("line").attr("class", "dag-baseline").attr("x1", Math.min(...leaves.map(X)) - pitch / 2).attr("x2", Math.max(...leaves.map(X)) + pitch / 2 + 14)
        .attr("y1", bottom + TR + 6).attr("y2", bottom + TR + 6).attr("marker-end", "url(#graph-read-arrow)");
      view.refit();
    },
  };
}
