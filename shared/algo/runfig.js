// Pure: the layout of a "run figure", the regular-language counterpart of the CTG. The string is a base line; above it runs the
// path of a DFA through its states, one edge for each stretch of the string. An edge that stands for more than one transition has
// its states left out and is jagged, as in the CTG. No DOM access.
//
//   spec: { nodes: [{ label, accept?, role?, start?, stuck?, pos? }],     the states shown, left to right; role "loop": a state at the
//                                                                          start of a round of the loop
//           segs:  [{ symbols: [string], role?, jag?, start?, end? }],     the stretch of the string between neighbouring states
//           abstract?: boolean }                                           the symbols are letters (x, y, z) for the general case
//   runFigLayout(spec, opts) -> { width, height, nodes, segs, tokens, spans, base }
//     nodes   [{ x, y, w, h, label, accept, role, start, stuck, pos, state }]       state: the automaton's own index, for linking
//     segs    [{ x0, x1, ex0, ex1, y, base, jag, role, start, end, cells }]     x0..x1 between the state centres, ex0..ex1 the edge between the boxes
//     tokens  [{ text, x, w, y, role, pos, cell }]                              pos: the position in the string that the symbol is read from
//     spans   [{ x0, x1, y, label, role }]                                a staple under the symbols of a segment (not with abstract)
const RUNFIG = { tokW: 26, segMin: 58, nodeH: 24, rowY: 34, drop: 78, margin: 24, entry: 24 };

function runFigNodeW(label) {
  return Math.max(30, String(label).length * 8 + 18);
}

function runFigLayout(spec, opts = {}) {
  const o = { ...RUNFIG, ...opts };
  const nw = spec.nodes.map((n) => runFigNodeW(n.label));
  const sw = spec.segs.map((s, k) => Math.max(o.segMin, s.symbols.length * o.tokW + 12, (nw[k] + nw[k + 1]) / 2 + 24));
  const x = [o.margin + (spec.nodes[0].start ? o.entry : 0) + nw[0] / 2];
  spec.segs.forEach((_, k) => x.push(x[k] + sw[k]));
  const baseY = o.rowY + o.drop;
  const nodes = spec.nodes.map((n, k) => ({ x: x[k], y: o.rowY, w: nw[k], h: o.nodeH, label: n.label, accept: !!n.accept, role: n.role || "", start: !!n.start, stuck: !!n.stuck, pos: n.pos === undefined ? -1 : n.pos, state: n.state === undefined ? -1 : n.state }));
  const segs = [], tokens = [], spans = [];
  spec.segs.forEach((s, k) => {
    segs.push({ x0: x[k], x1: x[k + 1], ex0: x[k] + nw[k] / 2, ex1: x[k + 1] - nw[k + 1] / 2, y: o.rowY, base: baseY, jag: !!s.jag, role: s.role || "", start: s.start === undefined ? -1 : s.start, end: s.end === undefined ? -1 : s.end, cells: s.cells || [] });
    const n = s.symbols.length, left = x[k] + (sw[k] - n * o.tokW) / 2;
    s.symbols.forEach((text, j) => tokens.push({ text, x: left + j * o.tokW, w: o.tokW, y: baseY, role: s.role || "", pos: s.start === undefined ? -1 : s.start + j, cell: s.cells ? s.cells[j] : "" }));
    if (!spec.abstract && n) spans.push({ x0: left, x1: left + n * o.tokW, y: baseY, label: s.role || "", role: s.role || "" });
  });
  const last = nodes.length - 1;
  return {
    width: x[last] + nw[last] / 2 + o.margin,
    height: baseY + 56,
    nodes, segs, tokens, spans,
    base: { x0: x[0] - nw[0] / 2, x1: x[last] + nw[last] / 2, y: baseY },
  };
}
