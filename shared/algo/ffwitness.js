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
  return { kind: "follow", sym: B, token: t, alt: alt % ways.length, count: ways.length, tree: w.root, marks: [{ leafId: t === "$" ? "end" : "t", kind: "follow", label: `${t} ∈ FOLLOW(${B})` }], nodeKinds: { target: "focus" }, endMarker: t === "$", unreachable: !!w.unreachable };
}

// ── The witness as a spine figure (ctgSpineLayout) ─────────────────────────────────────────────────────────────
// ffwSpec(w) -> the spec of ctgSpineLayout for a witness of ffwFirst, ffwFollow or ffwNullable.
// The spine is the path of the derivation to the member; what stands beside the path at each step is a string on each side, the
// shortest strings that the other symbols of the rule derive (ε for the ones that vanish), the symbols named under them.
//   FIRST(A) ∋ t    the path from A down to the rule that has t; t is the last node. An arrow runs from the left foot of A to t.
//   FOLLOW(B) ∋ t   the path from the start symbol down to B, whose string is the bottom. The first string on its right that
//                   is not ε starts with t (marked); an arrow runs from the right foot of B to it. $ stands after the whole string.
//   nullable A      the path from A down through the first symbol of each rule, down to a symbol with an empty rule; every
//                   string beside it is ε, with the symbols that derive it named under it.
const ffwTokens = (x) => (typeof x === "string" ? [x] : x.text !== undefined ? [x.text] : x.kids.flatMap(ffwTokens));
const ffwLabel = (x) => (typeof x === "string" ? x : x.text !== undefined ? x.text : x.sym);
const ffwHas = (x, id) => typeof x !== "string" && (x.id === id || (x.kids !== undefined && x.kids.some((k) => ffwHas(k, id))));

// nullable: the path goes down through the first symbol of each rule, which is a nonterminal that derives ε in its turn
const firstSymbol = (n) => n.kids.findIndex((k) => typeof k !== "string" && k.text === undefined);

// the strings beside the path: one cell for each symbol, the tokens it derives (ε if none), the symbol as its label; null for none
function ffwFlank(sibs) {
  if (!sibs.length) return null;
  return sibs.map((x) => { const toks = ffwTokens(x); return { text: toks.length ? toks.join(" ") : "ε", label: ffwLabel(x) }; });
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
  const level = (node, j) => ({ left: ffwFlank(node.kids.slice(0, j)), right: ffwFlank(node.kids.slice(j + 1)) });
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
        const i = n.kids.slice(j + 1).findIndex((x) => ffwHas(x, "t")); // the symbol whose string starts with the token
        if (i >= 0) { Object.assign(levels[k].right[i], { id: "t", kind: "follow", head: w.token, mark }); break; }
      }
    }
    const target = nodes[m];
    const toks = ffwTokens(target);
    const specNodes = nodes.map((n, k) => ({ sym: n.sym, jag: false, kind: k === m ? "focus" : "", cls: "" }));
    return spec(specNodes, levels, { text: toks.length ? toks.join(" ") : "ε", label: "" }, { outer, arrows: [{ fromNode: m, side: "right", toId: "t" }] });
  }

  // nullable: the path goes on through the first symbol that has a rule of its own to apply
  const nodes = path(firstSymbol);
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
    const j = w.kind === "first" ? cur.kids.findIndex((k) => ffwHas(k, "t")) : w.kind === "follow" ? cur.kids.findIndex((k) => ffwHas(k, "target")) : firstSymbol(cur);
    if (j < 0 || typeof cur.kids[j] === "string" || cur.kids[j].text !== undefined) break;
    cur = cur.kids[j];
  }
  spec.forms = ffwForms(w, path);
  spec.alt = w.alt;
  spec.count = w.count;
  if (w.kind === "nullable" && spec.forms[spec.forms.length - 1] !== "ε") spec.forms.push("ε");
  const side = (l) => (w.kind === "first" ? l.left : l.right) || [];
  const vanishing = spec.levels.some((l) => side(l).some((f) => f.text === EPSILON));
  if (w.kind === "first") spec.statement = `${w.token} ∈ FIRST(${w.sym}): ${w.sym} can derive a string that starts with ${w.token}` + (vanishing ? ", after symbols that derive ε" : "");
  else if (w.kind === "follow") spec.statement = `${w.token} ∈ FOLLOW(${w.sym}): in a sentence derived from the start symbol, ${w.sym} ` + (w.token === "$" ? "can be the last thing" : `can be followed by ${w.token}`) + (vanishing ? ", over symbols that derive ε" : "");
  else spec.statement = `${w.sym} is nullable: ${w.sym} can derive the empty string`;
  return spec;
}

// ── The general case ───────────────────────────────────────────────────────────────────────────────────────────
// ffwTheory(kind) -> a spec of ctgSpineLayout (with "statement" and "forms" as ffwSpec has) that shows what nullable, FIRST or
// FOLLOW mean for any grammar, with symbols in place of a grammar: the null state of the witness figure.
function ffwTheory(kind) {
  const cell = (text, label, extra = {}) => ({ text, label, ...extra });
  // every edge of a general figure stands for derivations of any length (⇒*), so it is jagged
  const node = (sym, extra = {}) => ({ sym, jag: true, ...extra });
  if (kind === "first") {
    return {
      nodes: [node("A", { kind: "focus" }), node("a", { kind: "first", colour: "var(--accent)", tone: 1 })],
      levels: [{ left: [cell("ε", "X₁ … Xᵢ")], right: [cell("…", "β", { cls: "is-dim" })] }],
      bottom: cell("a", "", { id: "t", kind: "first", mark: { kind: "first", label: "a ∈ FIRST(A)" } }),
      arrows: [{ fromNode: 0, side: "left", toId: "t" }],
      forms: ["A", "X₁ … Xᵢ a β"],
      statement: "a ∈ FIRST(A) when A derives X₁ … Xᵢ a β and each of X₁ … Xᵢ derives ε: from the left foot of A the first token that is not ε is a",
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
      arrows: [{ fromNode: 2, side: "right", toId: "t" }],
      forms: ["S", "α A δ", "α γ B β δ"],
      statement: "a ∈ FOLLOW(B) when S derives α A δ with δ starting with a, and A derives γ B β with β deriving ε: the end of B is the end of A, so a comes next",
    };
  }
  // nullable: A derives ε directly (a rule A → ε), or through other symbols: a rule A → X₁ … Xₙ in which every Xᵢ is nullable in
  // its turn, directly or not. Two figures; no Xᵢ is singled out, each has a column of its own.
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
    bottom: [cell("ε", "X₁ ⇒* ε"), cell("ε", "X₂ ⇒* ε"), cell("…", "", { cls: "is-dim" }), cell("ε", "Xₙ ⇒* ε")],
  };
  return {
    figures: [direct, indirect],
    forms: ["A", "ε"],
    formsText: "A ⇒ ε   |   A ⇒ X₁ … Xₙ ⇒* ε",
    statement: "A is nullable when a rule gives ε at once (A → ε), or when every symbol of some rule A → X₁ … Xₙ is nullable in its turn, directly or through other symbols",
  };
}
