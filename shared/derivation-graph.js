// The derivation graph view (see derivGraph in algo/derivation.js): for the grammars whose derivations are not trees. A symbol is drawn
// once, in its lane and in the row of the step that made it; a long edge runs down from it to the box of the step that rewrites it, or,
// while it is still in the form, to the strip at the bottom that reads the current form. A step is a box between two rows: the symbols
// it rewrites end there, the ones it makes start under it. A symbol the rule leaves as it is (its context) runs through the box.
// Needs d3, shared.js (TR, treeNodeW), fit-view.js and shared.css (.dag-*).
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
      if (svg.select("#graph-read-arrow").empty()) { // the reading order of the strip, as the tree's baseline has
        (svg.select("defs").empty() ? svg.insert("defs", ":first-child") : svg.select("defs")).append("marker")
          .attr("id", "graph-read-arrow").attr("markerUnits", "userSpaceOnUse").attr("markerWidth", 10).attr("markerHeight", 8)
          .attr("refX", 8).attr("refY", 4).attr("orient", "auto")
          .append("path").attr("d", "M0,0 L9,4 L0,8 z").attr("fill", "var(--text-lo)");
      }
      const nodes = new Map(model.nodes.map((n) => [n.id, n]));
      const pitch = Math.max(36, ...model.nodes.map((n) => treeNodeW(n.symbol))) + 8;
      const last = model.rows.length - 1;
      const X = (n) => n.lane * pitch, Y = (n) => n.born * ROW;
      const boxTop = (step) => (step - 1) * ROW + ROW / 2 - BOX_H / 2;
      const stripY = last * ROW + TR + 34;
      const g = root.append("g");

      // the lines first, then the boxes (which hide the lines of the context) and the nodes
      for (const n of model.nodes) {
        g.append("line").attr("class", "tree-edge").attr("x1", X(n)).attr("y1", Y(n) + TR).attr("x2", X(n)).attr("y2", n.died === null ? stripY - 14 : boxTop(n.died));
      }
      const span = (box) => {
        const xs = [...box.inputs, ...box.context].map((id) => X(nodes.get(id)));
        return [Math.min(...xs) - pitch / 2 + 4, Math.max(...xs) + pitch / 2 - 4];
      };
      for (const box of model.boxes) {
        const ins = box.inputs.map((id) => X(nodes.get(id)));
        const lo = Math.min(...ins), hi = Math.max(...ins);
        for (const id of box.outputs) { // from the box to what it made, kept inside what it rewrote
          const o = nodes.get(id);
          g.append("path").attr("class", "tree-edge").attr("d", `M ${Math.max(lo, Math.min(hi, X(o)))},${boxTop(box.step) + BOX_H} L ${X(o)},${Y(o) - TR}`);
        }
      }
      for (const box of model.boxes) {
        const r = box.step, [x1, x2] = span(box), top = boxTop(r);
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

      // the current form, read off the strip
      const alive = model.nodes.filter((n) => n.died === null);
      for (const n of alive) g.append("text").attr("class", "dag-final").attr("data-node", n.id).attr("x", X(n)).attr("y", stripY).text(n.symbol);
      g.append("line").attr("class", "dag-baseline").attr("x1", Math.min(...alive.map(X)) - 16).attr("x2", Math.max(...alive.map(X)) + 30)
        .attr("y1", stripY + 14).attr("y2", stripY + 14).attr("marker-end", "url(#graph-read-arrow)");
      view.refit();
    },
  };
}
