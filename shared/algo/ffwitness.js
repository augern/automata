// Pure: a picture-ready proof for each member of a nullable, FIRST or FOLLOW set (needs algo/grammar.js, firstfollow.js).
// A witness is a Christmas-tree graph (see algo/ctg.js) of a derivation that shows the member:
//   FIRST(A) ∋ t     A derives a string that starts with t; the symbols before t's are points (they derive ε)
//   FOLLOW(B) ∋ t    the start symbol derives a string with B's stretch immediately followed by t ($ = the end)
//   nullable A       A derives the empty string
// ffwFirst / ffwFollow / ffwNullable(g, rec, ...) -> { tree, marks, nodeKinds, abstract } or null if the member is not in the set.
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
  return { tree, marks: [{ leafId: "t", kind: "first", label: `${t} ∈ FIRST(${A})` }], nodeKinds: { target: "focus" } };
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
  return { tree, marks: [], nodeKinds: { target: "focus" } };
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
  return { tree: w.root, marks: [{ leafId: t === "$" ? "end" : "t", kind: "follow", label: `${t} ∈ FOLLOW(${B})` }], nodeKinds: { target: "focus" }, endMarker: t === "$", unreachable: !!w.unreachable };
}
