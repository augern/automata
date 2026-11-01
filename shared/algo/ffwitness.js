// Pure: a picture-ready proof for each member of a nullable, FIRST or FOLLOW set (needs algo/grammar.js, firstfollow.js).
// A witness is a Christmas-tree graph (see algo/ctg.js) of a derivation that shows the member:
//   FIRST(A) ∋ t     A derives a string that starts with t; the symbols before t's are points (they derive ε)
//   FOLLOW(B) ∋ t    the start symbol derives a string with B's stretch immediately followed by t ($ = the end)
//   nullable A       A derives the empty string
// ffwFirst / ffwFollow / ffwNullable(g, rec, ...) -> { kind, sym, token, tree, marks, nodeKinds } or null if the member is not in the set.
//   kind      first | follow | nullable; sym the symbol asked about, token the member
//   tree      the CTG input; the node of the symbol asked about has id "target", the token of the member has the leaf id "t"
//   marks, nodeKinds   for drawCTG
//   unreachable  FOLLOW: the symbol cannot be reached from the start symbol, so the tree starts at the nearest ancestor known
// Symbols off the path are drawn as triangles over their shortest terminal string ("abstract" nodes: not one rule application).

// The shortest terminal string of each nonterminal, as an array of tokens; null where there is none.
function ffwShortest(g) {
  const best = {};
  for (const nt of g.nonterminals) best[nt] = null;
  for (let changed = true; changed;) {
    changed = false;
    for (const r of g.rules) {
      let yields = [];
      let ok = true;
      for (const s of r.rhs) {
        if (g.nonterminals.has(s)) { if (!best[s]) { ok = false; break; } yields = yields.concat(best[s]); }
        else yields.push(s);
      }
      if (ok && (!best[r.lhs] || yields.length < best[r.lhs].length)) { best[r.lhs] = yields; changed = true; }
    }
  }
  return best;
}

function ffwBuilder(g, rec) {
  const shortest = ffwShortest(g);
  const st = ffStateAt(g, rec, rec.events.length - 1);
  let counter = 0;
  const id = () => "w" + counter++;
  const isNt = (s) => g.nonterminals.has(s);
  const b = {
    shortest,
    st,
    // a symbol that is not on the path: a token, a point if it derives ε, else a triangle over its shortest string
    rest(sym) {
      if (!isNt(sym)) return sym;
      const y = shortest[sym];
      if (!y) return { sym, id: id(), abstract: true, kids: ["…"] };
      return { sym, id: id(), abstract: true, kids: y.slice() };
    },
    // a symbol that derives ε, as a point
    vanish(sym) { return { sym, id: id(), abstract: true, kids: [] }; },
    node(sym, kids) { return { sym, id: id(), kids }; },
  };
  return b;
}

// The tree of "A derives a string starting with t" and the marks; path is built from the event that put t into FIRST(A).
function ffwFirstTree(g, rec, b, A, t, leafId) {
  const ev = rec.events[b.st.by.first[A][t]];
  const r = g.rules[ev.rule];
  const at = ev.cells.findIndex((c) => c.toks.includes(t)); // the symbol that starts with t; the ones before it derive ε
  const kids = r.rhs.map((s, j) => {
    if (j < at) return b.vanish(s);
    if (j > at) return b.rest(s);
    if (!g.nonterminals.has(s)) return { text: s, id: leafId };
    return ffwFirstTree(g, rec, b, s, t, leafId);
  });
  return b.node(A, kids);
}

function ffwFirst(g, rec, A, t) {
  if (!g.nonterminals.has(A) || !rec.first[A].has(t)) return null;
  const b = ffwBuilder(g, rec);
  const tree = ffwFirstTree(g, rec, b, A, t, "t");
  tree.id = "target";
  return { kind: "first", sym: A, token: t, tree, marks: [{ leafId: "t", kind: "first", label: `${t} ∈ FIRST(${A})` }], nodeKinds: { target: "focus" } };
}

// A derivation of A to ε, every step shown: each symbol of the rule is itself such a derivation.
function ffwNullableTree(g, rec, b, A) {
  const r = g.rules[rec.events[b.st.by.nullable[A]].rule];
  return b.node(A, r.rhs.map((s) => ffwNullableTree(g, rec, b, s)));
}

function ffwNullable(g, rec, A) {
  if (!rec.nullable.has(A)) return null;
  const b = ffwBuilder(g, rec);
  const tree = ffwNullableTree(g, rec, b, A);
  tree.id = "target";
  return { kind: "nullable", sym: A, tree, marks: [], nodeKinds: { target: "focus" } };
}

// For every nonterminal, the rule and position through which it is first reached from the start symbol: { A: { rule, pos } }.
function ffwReach(g) {
  const via = new Map([[g.start, null]]);
  const queue = [g.start];
  while (queue.length) {
    const a = queue.shift();
    g.rules.forEach((r, rule) => {
      if (r.lhs !== a) return;
      r.rhs.forEach((s, pos) => {
        if (g.nonterminals.has(s) && !via.has(s)) { via.set(s, { rule, pos }); queue.push(s); }
      });
    });
  }
  return via;
}

// The tree from the start symbol down to A: the node of A is returned with kids not yet filled in.
function ffwContext(g, b, via, A) {
  if (!via.has(A)) { const n = b.node(A, []); return { root: n, at: n, unreachable: true }; }
  if (via.get(A) === null) { const n = b.node(A, []); return { root: n, at: n }; }
  const { rule, pos } = via.get(A);
  const r = g.rules[rule];
  const up = ffwContext(g, b, via, r.lhs);
  const at = b.node(A, []);
  up.at.kids = r.rhs.map((s, j) => (j === pos ? at : b.rest(s)));
  return { root: up.root, at, unreachable: up.unreachable };
}

// A tree of the start symbol in which B is followed by t; { root, at (the node of B), unreachable }.
function ffwFollowTree(g, rec, b, via, B, t) {
  const ev = rec.events[b.st.by.follow[B][t]];
  if (ev.rule < 0) { const n = b.node(B, []); return { root: n, at: n }; }
  const r = g.rules[ev.rule];
  const fromParent = ev.viaFollow.includes(t);
  const ctx = fromParent ? ffwFollowTree(g, rec, b, via, r.lhs, t) : ffwContext(g, b, via, r.lhs);
  const at = b.node(B, []);
  const from = ev.cells.findIndex((c) => c.toks.includes(t)); // in what follows B: the symbol that starts with t
  ctx.at.kids = r.rhs.map((s, j) => {
    if (j < ev.pos) return b.rest(s);
    if (j === ev.pos) return at;
    const k = j - ev.pos - 1;
    if (fromParent || k < from) return b.vanish(s);
    if (k > from) return b.rest(s);
    return g.nonterminals.has(s) ? ffwFirstTree(g, rec, b, s, t, "t") : { text: s, id: "t" };
  });
  return { root: ctx.root, at, unreachable: ctx.unreachable };
}

function ffwFollow(g, rec, B, t) {
  if (!g.nonterminals.has(B) || !rec.follow[B].has(t)) return null;
  const b = ffwBuilder(g, rec);
  const w = ffwFollowTree(g, rec, b, ffwReach(g), B, t);
  // the symbol asked about is drawn over its shortest string
  const y = b.shortest[B];
  w.at.id = "target";
  w.at.abstract = true;
  w.at.kids = y ? y.slice() : ["…"];
  return { kind: "follow", sym: B, token: t, tree: w.root, marks: [{ leafId: t === "$" ? "end" : "t", kind: "follow", label: `${t} ∈ FOLLOW(${B})` }], nodeKinds: { target: "focus" }, endMarker: t === "$", unreachable: !!w.unreachable };
}

// ── The witness as a spine figure (ctgSpineLayout) ─────────────────────────────────────────────────────────────
// ffwSpec(w) -> the spec of ctgSpineLayout for a witness of ffwFirst, ffwFollow or ffwNullable.
// The spine is the path of the derivation to the member; what stands beside the path at each step is a string on each side, the
// shortest strings that the other symbols of the rule derive (ε for the ones that vanish), the symbols named under them.
//   FIRST(A) ∋ t    the path from A down to the rule that has t; t is the last node. An arrow runs from the left foot of A to t.
//   FOLLOW(B) ∋ t   the path from the start symbol down to B, whose string is the bottom. The first string on its right that
//                   is not ε starts with t (marked); an arrow runs from the right foot of B to it. $ stands after the whole string.
//   nullable A      the path from A down the first symbol that does not derive ε at once; every string beside it is ε.
const ffwTokens = (x) => (typeof x === "string" ? [x] : x.text !== undefined ? [x.text] : x.kids.flatMap(ffwTokens));
const ffwLabel = (x) => (typeof x === "string" ? x : x.text !== undefined ? x.text : x.sym);
const ffwHas = (x, id) => typeof x !== "string" && (x.id === id || (x.kids !== undefined && x.kids.some((k) => ffwHas(k, id))));

// the string beside the path: the tokens of the symbols, ε if none; the symbols as its label
function ffwFlank(sibs, extra = {}) {
  if (!sibs.length) return null;
  const toks = sibs.flatMap(ffwTokens);
  return { text: toks.length ? toks.join(" ") : "ε", label: sibs.map(ffwLabel).join(" "), ...extra };
}

function ffwFigure(w) {
  // the nodes of the path, from the root: next(node) is the index of the kid that the path goes on through, or -1
  const path = (next) => {
    const nodes = [w.tree];
    for (let cur = w.tree; ; ) {
      const j = next(cur);
      if (j < 0 || typeof cur.kids[j] === "string" || cur.kids[j].text !== undefined) break;
      cur = cur.kids[j];
      nodes.push(cur);
    }
    return nodes;
  };
  const level = (node, j, extra = {}) => ({ left: ffwFlank(node.kids.slice(0, j)), right: ffwFlank(node.kids.slice(j + 1), extra) });
  const spec = (nodes, levels, bottom, extra = {}) => ({ nodes, levels, bottom, ...extra });
  const nodeOf = (n, k, kind) => ({ sym: n.sym, jag: false, kind: k === 0 && kind ? kind : "", cls: "" });

  if (w.kind === "first") {
    const nodes = path((n) => n.kids.findIndex((k) => ffwHas(k, "t")));
    const last = nodes[nodes.length - 1];
    const at = last.kids.findIndex((k) => ffwHas(k, "t"));
    const levels = nodes.slice(0, -1).map((n, k) => level(n, n.kids.findIndex((x) => x === nodes[k + 1])));
    levels.push(level(last, at));
    const specNodes = nodes.map((n, k) => nodeOf(n, k, "focus"));
    specNodes.push({ sym: w.token, jag: false, kind: "first", colour: "var(--accent)", tone: 1, cls: "" });
    return spec(specNodes, levels, { text: w.token, id: "t", kind: "first", mark: { kind: "first", label: `${w.token} ∈ FIRST(${w.sym})` } }, { arrows: [{ fromNode: 0, side: "left", toId: "t" }] });
  }

  if (w.kind === "follow") {
    const nodes = path((n) => n.kids.findIndex((k) => ffwHas(k, "target")));
    const m = nodes.length - 1;
    const levels = nodes.slice(0, -1).map((n, k) => level(n, n.kids.findIndex((x) => x === nodes[k + 1])));
    // the string on the right that starts with the token: the innermost level whose right-hand string has the leaf t
    let outer = null;
    const mark = { kind: "follow", label: `${w.token} ∈ FOLLOW(${w.sym})` };
    if (w.token === "$") outer = { left: null, right: { text: "$", id: "t", kind: "follow", mark } };
    else {
      for (let k = m - 1; k >= 0; k--) {
        const n = nodes[k], j = n.kids.findIndex((x) => x === nodes[k + 1]);
        if (n.kids.slice(j + 1).some((x) => ffwHas(x, "t"))) { levels[k].right = { ...levels[k].right, id: "t", kind: "follow", head: w.token, mark }; break; }
      }
    }
    const target = nodes[m];
    const toks = ffwTokens(target);
    const specNodes = nodes.map((n, k) => ({ sym: n.sym, jag: false, kind: k === m ? "focus" : "", cls: "" }));
    return spec(specNodes, levels, { text: toks.length ? toks.join(" ") : "ε", label: "" }, { outer, arrows: [{ fromNode: m, side: "right", toId: "t" }] });
  }

  // nullable: the path goes on through the first symbol that has a rule of its own to apply
  const nodes = path((n) => n.kids.findIndex((k) => typeof k !== "string" && k.text === undefined && k.kids.length));
  const levels = nodes.slice(0, -1).map((n, k) => level(n, n.kids.findIndex((x) => x === nodes[k + 1])));
  const last = nodes[nodes.length - 1];
  // the last node's own symbols all vanish: they are the bottom
  const bottom = { text: "ε", label: last.kids.map(ffwLabel).join(" "), kind: "focus", mark: { kind: "focus", label: `${w.sym} derives ε` } };
  return spec(nodes.map((n, k) => nodeOf(n, k, "focus")), levels, bottom);
}

// The derivation along the path, as the sentential forms from the symbol at the top down to the one that shows the member:
// ["E", "T E'", "F T' E'", "id T' E'"]. (FOLLOW stops at the form that has the symbol asked about.)
function ffwForms(w, nodes) {
  const forms = [nodes[0].sym];
  let left = [], right = [];
  const last = w.kind === "follow" ? nodes.length - 1 : nodes.length;
  for (let k = 0; k < last; k++) {
    const n = nodes[k];
    forms.push([...left, ...n.kids.map(ffwLabel), ...right].join(" ") || "ε");
    const j = k + 1 < nodes.length ? n.kids.findIndex((x) => x === nodes[k + 1]) : -1;
    if (j >= 0) {
      left = [...left, ...n.kids.slice(0, j).map(ffwLabel)];
      right = [...n.kids.slice(j + 1).map(ffwLabel), ...right];
    }
  }
  return forms;
}

// ffwSpec(w) -> the spec of ctgSpineLayout (see ffwFigure) with the derivation ("forms") and a sentence on what the figure
// shows ("statement") added.
function ffwSpec(w) {
  const spec = ffwFigure(w);
  const path = [];
  for (let cur = w.tree; ; ) {
    path.push(cur);
    const j = w.kind === "first" ? cur.kids.findIndex((k) => ffwHas(k, "t")) : w.kind === "follow" ? cur.kids.findIndex((k) => ffwHas(k, "target")) : cur.kids.findIndex((k) => typeof k !== "string" && k.text === undefined && k.kids.length);
    if (j < 0 || typeof cur.kids[j] === "string" || cur.kids[j].text !== undefined) break;
    cur = cur.kids[j];
  }
  spec.forms = ffwForms(w, path);
  if (w.kind === "nullable" && spec.forms[spec.forms.length - 1] !== "ε") spec.forms.push("ε");
  const vanishing = spec.levels.some((l) => (w.kind === "first" ? l.left : l.right) && (w.kind === "first" ? l.left : l.right).text === EPSILON);
  if (w.kind === "first") spec.statement = `${w.token} ∈ FIRST(${w.sym}): ${w.sym} can derive a string that starts with ${w.token}` + (vanishing ? ", after symbols that derive ε" : "");
  else if (w.kind === "follow") spec.statement = `${w.token} ∈ FOLLOW(${w.sym}): in a sentence derived from the start symbol, ${w.sym} ` + (w.token === "$" ? "can be the last thing" : `can be followed by ${w.token}`) + (vanishing ? ", over symbols that derive ε" : "");
  else spec.statement = `${w.sym} is nullable: ${w.sym} can derive the empty string`;
  return spec;
}
