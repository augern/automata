// The derivation graph view (see derivGraph in algo/derivation.js): for the grammars whose derivations are not trees. One row for
// each form; a symbol is one node from its row of birth, carried down (dimmed) until a step rewrites it; a step is a box between two
// rows, with the symbols it rewrites above and the ones it makes below. The symbols a rule leaves as they are pass through its box.
// Needs d3, shared.js (TR, treeNodeW), fit-view.js and shared.css (.dag-*).
//
//   const view = createDerivGraph({ svg: "graph-svg", root: "graph-root" });
//   view.draw(model, grammar, steps);   model: derivGraph(grammar, steps); the last row is the current form
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
      const root = d3.select("#" + spec.root);
      root.selectAll("*").remove();
      has = true;
      const nodes = new Map(model.nodes.map((n) => [n.id, n]));
      const pitch = Math.max(36, ...model.nodes.map((n) => treeNodeW(n.symbol))) + 8;
      const last = model.rows.length - 1;
      const at = (r, k) => ({ x: k * pitch, y: r * ROW });
      const g = root.append("g");

      // the lines first, the nodes and boxes over them
      model.rows.forEach((row, r) => {
        if (r === 0) return;
        const box = model.boxes[r - 1], prev = model.rows[r - 1];
        const x1 = at(r - 1, box.lo).x - pitch / 2 + 4, x2 = at(r - 1, box.hi).x + pitch / 2 - 4;
        const top = (r - 1) * ROW + TR + (ROW - 2 * TR - BOX_H) / 2, bottom = top + BOX_H;
        const clamp = (x) => Math.max(x1 + 6, Math.min(x2 - 6, x));
        prev.forEach((id, k) => {
          const n = at(r - 1, k);
          if (box.inputs.includes(id)) {
            g.append("path").attr("class", "tree-edge").attr("d", `M ${n.x},${n.y + TR} L ${clamp(n.x)},${top}`);
          } else if (row.includes(id)) {
            const m = at(r, row.indexOf(id));
            g.append("line").attr("class", "dag-carry").attr("x1", n.x).attr("y1", n.y + TR).attr("x2", m.x).attr("y2", m.y - TR);
          }
        });
        box.outputs.forEach((id) => {
          const m = at(r, row.indexOf(id));
          g.append("path").attr("class", "tree-edge").attr("d", `M ${clamp(m.x)},${bottom} L ${m.x},${m.y - TR}`);
        });
      });
      model.boxes.forEach((box) => {
        const r = box.step, x1 = at(r - 1, box.lo).x - pitch / 2 + 4, x2 = at(r - 1, box.hi).x + pitch / 2 - 4;
        const top = (r - 1) * ROW + TR + (ROW - 2 * TR - BOX_H) / 2;
        const bg = g.append("g").attr("class", "dag-box").attr("data-node", "s" + r).attr("data-prod", box.ruleIdx + 1)
          .attr("transform", `translate(${x1},${top})`);
        bg.append("rect").attr("width", x2 - x1).attr("height", BOX_H).attr("rx", 5);
        bg.append("text").attr("x", (x2 - x1) / 2).attr("y", BOX_H / 2).text("r" + (box.ruleIdx + 1));
        const bd = bg.append("g").attr("class", "tree-badge").attr("transform", "translate(2,0)");
        bd.append("circle").attr("r", 7 + (String(r).length - 1) * 2);
        bd.append("text").text(r);
        if (!box.outputs.length) g.append("text").attr("class", "dag-eps").attr("x", (x1 + x2) / 2).attr("y", top + BOX_H + 14).text("ε");
      });
      model.rows.forEach((row, r) => {
        row.forEach((id, k) => {
          const n = nodes.get(id), p = at(r, k);
          const fresh = n.born === r, current = r === last && n.born === last;
          const isTerm = !grammar.nonterminals.has(n.symbol);
          const cls = "tree-node" + (isTerm ? " terminal" : "") + (current && last > 0 ? " new-node" : "") + (fresh ? "" : " dag-carried");
          const ng = g.append("g").attr("class", cls).attr("data-node", id).attr("transform", `translate(${p.x},${p.y})`);
          const w = treeNodeW(n.symbol);
          ng.append("rect").attr("class", "tn-shape").attr("x", -w / 2).attr("y", -TR).attr("width", w).attr("height", 2 * TR).attr("rx", TR);
          ng.append("text").text(n.symbol);
        });
      });
      view.refit();
    },
  };
}
