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

// Does the shortest string of each nonterminal come from one rule of terminals only (one derivation step)? { A: true | false | undefined }
function ffwShortestOneStep(g) {
  const best = ffwShortest(g), out = {};
  for (const nt of g.nonterminals) out[nt] = !!best[nt] && g.rules.some((r) => r.lhs === nt && r.rhs.every((x) => !g.nonterminals.has(x)) && r.rhs.length === best[nt].length);
  return out;
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

// How many ways of showing a member there are at most: the ones with the fewest nodes first.
const FFW_LIMIT = 12;
const ffwSize = (x) => (typeof x === "string" || x.text !== undefined ? 1 : 1 + x.kids.reduce((n, k) => n + ffwSize(k), 0));
const ffwBest = (trees, size = ffwSize) => trees.map((t) => [size(t), t]).sort((x, y) => x[0] - y[0]).slice(0, FFW_LIMIT).map((x) => x[1]);

// The trees of "A derives a string starting with t": one for each rule of A that has t first (after symbols that derive ε), and
// for each way the symbol with t does it. seen: the (symbol, token) pairs on the way down, so that a left recursion is not followed.
function ffwFirstTrees(g, rec, b, A, t, leafId, seen) {
  const key = A + "\u0000" + t;
  if (seen.has(key)) return [];
  const next = new Set(seen).add(key);
  const out = [];
  g.rules.forEach((r) => {
    if (r.lhs !== A) return;
    const sc = ffScan(r.rhs, g.nonterminals, rec.nullable, rec.first, true);
    // each symbol that can start with t, the ones before it deriving ε
    sc.cells.forEach((cell, at) => {
      if (cell.state === "unread" || !cell.toks.includes(t)) return;
      const subs = g.nonterminals.has(r.rhs[at]) ? ffwFirstTrees(g, rec, b, r.rhs[at], t, leafId, next) : [null];
      for (const sub of subs) out.push(b.node(A, r.rhs.map((s, j) => (j < at ? b.vanish(s) : j > at ? b.rest(s) : sub === null ? { text: s, id: leafId } : sub))));
    });
  });
  return ffwBest(out);
}

// A witness of FIRST: alt picks one of the ways (the shortest first); count says how many there are.
function ffwFirst(g, rec, A, t, alt = 0) {
  if (!g.nonterminals.has(A) || !rec.first[A].has(t)) return null;
  const trees = ffwFirstTrees(g, rec, ffwBuilder(g, rec), A, t, "t", new Set());
  if (!trees.length) return null;
  const tree = trees[alt % trees.length];
  tree.id = "target";
  return { kind: "first", sym: A, token: t, alt: alt % trees.length, count: trees.length, tree, marks: [{ leafId: "t", kind: "first", label: `${t} ∈ FIRST(${A})` }], nodeKinds: { target: "focus" } };
}

// The trees of "A derives ε": one for each rule whose symbols all do, each symbol shown by its shortest way.
function ffwNullableTrees(g, rec, b, A, seen) {
  if (seen.has(A)) return [];
  const next = new Set(seen).add(A);
  const out = [];
  g.rules.forEach((r) => {
    if (r.lhs !== A || !ffScan(r.rhs, g.nonterminals, rec.nullable, rec.first, false).end) return;
    const kids = r.rhs.map((s) => ffwNullableTrees(g, rec, b, s, next)[0]);
    if (kids.every(Boolean)) out.push(b.node(A, kids));
  });
  return ffwBest(out);
}

function ffwNullable(g, rec, A, alt = 0) {
  if (!rec.nullable.has(A)) return null;
  const trees = ffwNullableTrees(g, rec, ffwBuilder(g, rec), A, new Set());
  if (!trees.length) return null;
  const tree = trees[alt % trees.length];
  tree.id = "target";
  return { kind: "nullable", sym: A, alt: alt % trees.length, count: trees.length, tree, marks: [], nodeKinds: { target: "focus" } };
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

// The trees of the start symbol in which B is followed by t: { root, at, unreachable }, one for each rule that has B with t after it,
// and for each way of showing it. Either t starts what comes after B in the rule (after symbols that derive ε), or what comes after
// B can vanish and t follows the left side.
function ffwFollowTrees(g, rec, b, via, B, t, seen) {
  const key = B + "\u0000" + t;
  if (seen.has(key)) return [];
  const next = new Set(seen).add(key);
  const out = [];
  if (B === g.start && t === "$") { const n = b.node(B, []); out.push({ root: n, at: n }); }
  g.rules.forEach((r) => {
    r.rhs.forEach((s, pos) => {
      if (s !== B) return;
      const sc = ffScan(r.rhs.slice(pos + 1), g.nonterminals, rec.nullable, rec.first, true);
      // the symbols after B, in the tree of the left side
      const place = (ctx, tail) => {
        const at = b.node(B, []);
        ctx.at.kids = r.rhs.map((x, j) => (j < pos ? b.rest(x) : j === pos ? at : tail(x, j - pos - 1)));
        return { root: ctx.root, at, unreachable: ctx.unreachable };
      };
      // in what follows B: each symbol that can start with t, the ones before it deriving ε
      sc.cells.forEach((cell, from) => {
        if (cell.state === "unread" || !cell.toks.includes(t)) return;
        const sym = r.rhs[pos + 1 + from];
        const subs = g.nonterminals.has(sym) ? ffwFirstTrees(g, rec, b, sym, t, "t", new Set()) : [{ text: sym, id: "t" }];
        for (const sub of subs) out.push(place(ffwContext(g, b, via, r.lhs), (x, k) => (k < from ? b.vanish(x) : k > from ? b.rest(x) : sub)));
      });
      if (sc.end && rec.follow[r.lhs].has(t)) {
        for (const ctx of ffwFollowTrees(g, rec, b, via, r.lhs, t, next)) out.push(place(ctx, (x) => b.vanish(x)));
      }
    });
  });
  return ffwBest(out, (w) => ffwSize(w.root));
}

function ffwFollow(g, rec, B, t, alt = 0) {
  if (!g.nonterminals.has(B) || !rec.follow[B].has(t)) return null;
  const b = ffwBuilder(g, rec);
  const ways = ffwFollowTrees(g, rec, b, ffwReach(g), B, t, new Set());
  if (!ways.length) return null;
  const w = ways[alt % ways.length];
  // the symbol asked about is drawn over its shortest string
  const y = b.shortest[B];
  w.at.id = "target";
  w.at.abstract = true;
  w.at.kids = y ? y.slice() : ["…"];
  return { kind: "follow", sym: B, token: t, alt: alt % ways.length, count: ways.length, oneStep: ffwShortestOneStep(g)[B], tree: w.root, marks: [{ leafId: t === "$" ? "end" : "t", kind: "follow", label: `${t} ∈ FOLLOW(${B})` }], nodeKinds: { target: "focus" }, endMarker: t === "$", unreachable: !!w.unreachable };
}

// ── The witness as a spine figure (ctgSpineLayout) ─────────────────────────────────────────────────────────────
// ffwSpec(w) -> the spec of ctgSpineLayout for a witness of ffwFirst, ffwFollow or ffwNullable.
// The spine is the path of the derivation to the member; what stands beside the path at each step is a string on each side, the
// shortest strings that the other symbols of the rule derive (ε for the ones that vanish), the symbols named under them.
//   FIRST(A) ∋ t    the path from A down to the rule that has t; t is the last node.
//   FOLLOW(B) ∋ t   the path from the start symbol down to B, whose string is the bottom. The first string on its right that
//                   is not ε starts with t (marked) $ stands after the whole string.
//   nullable A      A as a bare node over the symbols of its rule, each a node with a small triangle over its ε: a straight edge
//                   down for a symbol with an empty rule, a jagged one for a symbol that derives ε through others.
const ffwTokens = (x) => (typeof x === "string" ? [x] : x.text !== undefined ? [x.text] : x.kids.flatMap(ffwTokens));
const ffwLabel = (x) => (typeof x === "string" ? x : x.text !== undefined ? x.text : x.sym);
const ffwHas = (x, id) => typeof x !== "string" && (x.id === id || (x.kids !== undefined && x.kids.some((k) => ffwHas(k, id))));

// The cell of a symbol beside the path. What the figure's point depends on is spelled out: a terminal written in the rule, ε where the
// symbol vanishes, the token of the member (in bold, with a faded … for the rest of its string). What is only "some string this symbol
// derives" is a faded …, with the shortest such string as a tooltip, or, with samples, that string itself, faded.
function ffwCell(x, samples) {
  const toks = ffwTokens(x), label = ffwLabel(x), sample = toks.join(" ");
  if (!toks.length) return { text: "ε", label };
  if (typeof x === "string" || x.text !== undefined) return { text: sample, label }; // a terminal of the rule
  if (ffwHas(x, "t")) return { text: toks.length === 1 ? toks[0] : (samples ? sample : toks[0] + " …"), label, tip: toks.length > 1 ? "e.g. " + sample : "" }; // the member's token starts it
  return { text: samples ? sample : "…", label, cls: "is-dim", tip: "e.g. " + sample };
}
const ffwFlank = (sibs, samples) => (sibs.length ? sibs.map((x) => ffwCell(x, samples)) : null);

// A run of nodes joined by steps that have no strings beside them (unit rules) says only that the top derives the bottom one: the
// nodes between are left out and the edge into the bottom one is jagged. The first and last node of a run stay.
function ffwCompact(spec) {
  const bare = (l) => !l.left && !l.right, n = spec.nodes.length;
  const kept = spec.nodes.map((_, k) => k).filter((k) => k === 0 || k === n - 1 || !(bare(spec.levels[k - 1]) && bare(spec.levels[k])));
  const nodes = kept.map((k, i) => (i && k - kept[i - 1] > 1 ? { ...spec.nodes[k], jag: true } : spec.nodes[k]));
  const levels = kept.slice(1).map((k, i) => (k - kept[i] > 1 ? { left: null, right: null } : spec.levels[kept[i]]));
  return { ...spec, nodes, levels };
}

function ffwFigure(w, opts = {}) {
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
  const level = (node, j) => ({ left: ffwFlank(node.kids.slice(0, j), opts.samples), right: ffwFlank(node.kids.slice(j + 1), opts.samples) });
  const spec = (nodes, levels, bottom, extra = {}) => ({ nodes, levels, bottom, ...extra });
  const nodeOf = (n, k, kind) => ({ sym: n.sym, jag: false, kind: k === 0 && kind ? kind : "", cls: "" });

  if (w.kind === "first") {
    const nodes = path((n) => n.kids.findIndex((k) => ffwHas(k, "t")));
    const last = nodes[nodes.length - 1];
    const at = last.kids.findIndex((k) => ffwHas(k, "t"));
    const levels = nodes.slice(0, -1).map((n, k) => level(n, n.kids.findIndex((x) => x === nodes[k + 1])));
    // the last node derives its rule's symbols: the token is one of them, a leaf like the others
    const { left, right } = level(last, at);
    const token = { text: w.token, id: "t", kind: "first", mark: { kind: "first", label: `${w.token} ∈ FIRST(${w.sym})` } };
    return ffwCompact(spec(nodes.map((n, k) => nodeOf(n, k, "focus")), levels, [...(left || []), token, ...(right || [])]));
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
        const i = n.kids.slice(j + 1).findIndex((x) => ffwHas(x, "t")); // the symbol whose string starts with the token
        if (i >= 0) { Object.assign(levels[k].right[i], { id: "t", kind: "follow", head: levels[k].right[i].text === w.token ? "" : w.token, mark }); break; }
      }
    }
    const target = nodes[m];
    const toks = ffwTokens(target);
    const specNodes = nodes.map((n, k) => ({ sym: n.sym, jag: false, kind: k === m ? "focus" : "", cls: "" }));
    // the symbol derives its string in more than one rule step: a jagged line down to it
    const bottom = !toks.length ? { text: "ε", label: "" } : { text: opts.samples ? toks.join(" ") : "…", label: "", cls: "is-dim", tip: "e.g. " + toks.join(" ") };
    return ffwCompact(spec(specNodes, levels, bottom, { outer, terminus: !w.oneStep }));
  }

  // nullable: the root's rule: each of its symbols is a node of its own with a small triangle over its ε, the root bare. A symbol with an
  // empty rule of its own derives ε in one step; one with a rule of symbols derives it through others, in steps that are not drawn: a
  // jagged line.
  const root = w.tree;
  const mark = { kind: "focus", label: `${w.sym} derives ε` };
  if (!root.kids.length) return spec([nodeOf(root, 0, "focus")], [], { text: "ε", label: `${root.sym} → ε`, kind: "focus", mark });
  return spec([nodeOf(root, 0, "focus")], [], root.kids.map((k, i) => ({ text: "ε", label: "", ...(i ? {} : { kind: "focus", mark }), node: { sym: k.sym, jag: k.kids.length > 0 } })));
}

// ffwSpec(w, { samples }) -> the spec of ctgSpineLayout (see ffwFigure) with alt and count of the ways of showing the member added.
// A string that is only some string a symbol derives is a faded …; with samples, the shortest one.
function ffwSpec(w, opts = {}) {
  const spec = ffwFigure(w, opts);
  spec.alt = w.alt;
  spec.count = w.count;
  return spec;
}

// ── The general case ───────────────────────────────────────────────────────────────────────────────────────────
// ffwTheory(kind) -> a spec of ctgSpineLayout that shows what nullable, FIRST or
// FOLLOW mean for any grammar, with symbols in place of a grammar: the null state of the witness figure.
function ffwTheory(kind) {
  const cell = (text, label, extra = {}) => ({ text, label, ...extra });
  // every edge of a general figure stands for derivations of any length (⇒*), so it is jagged
  const node = (sym, extra = {}) => ({ sym, jag: true, ...extra });
  if (kind === "first") {
    return {
      nodes: [node("A", { kind: "focus", jag: false })],
      levels: [],
      bottom: [cell("ε", "X₁ … Xᵢ"), cell("a", "", { id: "t", kind: "first", mark: { kind: "first", label: "a ∈ FIRST(A)" } }), cell("…", "β", { cls: "is-dim" })],
      terminus: true, // A derives the string in as many steps as it needs
    };
  }
  if (kind === "follow") {
    return {
      nodes: [node("S"), node("A"), node("B", { kind: "focus" })],
      levels: [
        { left: [cell("…", "α", { cls: "is-dim" })], right: [cell("a …", "δ", { id: "t", kind: "follow", head: "a", mark: { kind: "follow", label: "a ∈ FOLLOW(B)" } })] },
        { left: [cell("…", "γ", { cls: "is-dim" })], right: [cell("ε", "β")] },
      ],
      bottom: cell("…", "x", { cls: "is-dim" }),
      terminus: true, // B derives x in as many steps as it needs
    };
  }
  // nullable: A derives ε directly (a rule A → ε), or through other symbols: a rule A → X₁ … Xₙ in which every Xᵢ is nullable in
  // its turn, directly or not. Two figures; no Xᵢ is singled out: each is a node of its own with a small triangle under A, and a jagged
  // edge down to its ε, since it derives ε in any number of steps.
  const direct = {
    caption: "directly",
    nodes: [node("A", { kind: "focus", jag: false })],
    levels: [],
    bottom: cell("ε", "A → ε", { kind: "focus", mark: { kind: "focus", label: "A derives ε" } }),
  };
  const indirect = {
    caption: "through other symbols",
    nodes: [node("A", { kind: "focus", jag: false })],
    levels: [],
    bottom: [cell("ε", "", { node: { sym: "X₁", jag: true } }), cell("ε", "", { node: { sym: "X₂", jag: true } }), cell("…", "", { cls: "is-dim" }), cell("ε", "", { node: { sym: "Xₙ", jag: true } })],
    span: { label: "X₁ … Xₙ", mark: { kind: "focus", label: "A derives ε" } },
  };
  return {
    figures: [direct, indirect],
  };
}
