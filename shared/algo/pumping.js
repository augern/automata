// Pure helpers for the pumping explorer: why long strings of a regular language can be pumped
// (a repeated state in a DFA's path) and why long strings of a context-free language can be pumped
// (a repeated nonterminal on a path of a parse tree). No DOM access.
// Depends on grammar.js and rdp.js (the parse trees come from its parser) and, for the regular
// expression → DFA conversion in the tool, regex.js.

// ── DFA ──────────────────────────────────────────────────────────────

// Text format, one item per line (// starts a comment):
//   start: q0            the start state (default: the first state mentioned)
//   accept: q2 q3        the accepting states
//   q0 a q1              from-state, symbol, to-state (symbols a,b share a line: q0 a,b q1)
// A missing transition means the machine stops and rejects. Returns
// { states: [name], start, accepts: Set<index>, next: [{ symbol: index }], alpha: [symbol] }.
function pumpParseDFA(text) {
  let startName = null;
  let acceptNames = [];
  const rows = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    let m = /^start\s*:\s*(\S+)\s*$/i.exec(line);
    if (m) { startName = m[1]; continue; }
    m = /^accept(?:s|ing)?\s*:\s*(.*)$/i.exec(line);
    if (m) { acceptNames = m[1].split(/[\s,]+/).filter(Boolean); continue; }
    const parts = line.split(/\s+/);
    if (parts.length !== 3) throw new Error("Expected “state symbol state”: " + line);
    rows.push(parts);
  }
  const states = [];
  const idx = (n) => { let i = states.indexOf(n); if (i < 0) { states.push(n); i = states.length - 1; } return i; };
  if (startName !== null) idx(startName);
  for (const [f, , t] of rows) { idx(f); idx(t); }
  for (const n of acceptNames) idx(n);
  if (!states.length) throw new Error("No states");
  const next = states.map(() => ({}));
  const alpha = [];
  for (const [f, syms, t] of rows) {
    for (const a of syms.split(",").filter(Boolean)) {
      if ([...a].length !== 1) throw new Error("A symbol must be a single character: " + a);
      if (!alpha.includes(a)) alpha.push(a);
      const from = idx(f), to = idx(t);
      if (next[from][a] !== undefined && next[from][a] !== to) throw new Error(f + " on " + a + " goes to two states: this is not a DFA");
      next[from][a] = to;
    }
  }
  alpha.sort();
  return { states, start: startName === null ? 0 : idx(startName), accepts: new Set(acceptNames.map(idx)), next, alpha };
}

// A minimal DFA from regex.js (minimizeDFA) as a DFA of this module, states named q0, q1, …
function pumpDFAFromMin(min) {
  const n = min.dfaStates.length;
  const next = Array.from({ length: n }, () => ({}));
  for (const t of min.dfaTrans) next[t.from][t.sym] = t.to;
  return { states: Array.from({ length: n }, (_, i) => "q" + i), start: 0, accepts: new Set(min.dfaAccepts), next, alpha: [...min.alpha].sort() };
}

function pumpDFAToText(dfa) {
  const out = ["start: " + dfa.states[dfa.start], "accept: " + [...dfa.accepts].map((i) => dfa.states[i]).join(" ")];
  dfa.states.forEach((name, s) => {
    const by = new Map();
    for (const a of dfa.alpha) {
      const t = dfa.next[s][a];
      if (t !== undefined) by.set(t, (by.get(t) || []).concat(a));
    }
    for (const [t, syms] of by) out.push(name + " " + syms.join(",") + " " + dfa.states[t]);
  });
  return out.join("\n");
}

// The path of states for w: { path: [state per position, from 0], accepted, stuckAt } where stuckAt
// is the position of the first missing transition, or -1.
function pumpDFARun(dfa, w) {
  const path = [dfa.start];
  const chars = [...w];
  for (let k = 0; k < chars.length; k++) {
    const t = dfa.next[path[k]][chars[k]];
    if (t === undefined) return { path, accepted: false, stuckAt: k };
    path.push(t);
  }
  return { path, accepted: dfa.accepts.has(path[path.length - 1]), stuckAt: -1 };
}

// The first state that the path visits twice: { s, t } with path[s] = path[t] and s < t, the smallest t.
// With at least as many symbols as the DFA has states there always is one, and t ≤ the number of
// states: that is the pumping lemma's |xy| ≤ p. null when the path has no repeat.
function pumpFindLoop(path) {
  const seen = new Map();
  for (let t = 0; t < path.length; t++) {
    if (seen.has(path[t])) return { s: seen.get(path[t]), t };
    seen.set(path[t], t);
  }
  return null;
}

// w = x y z with y the symbols of the loop.
function pumpSplit(w, loop) {
  const c = [...w];
  return { x: c.slice(0, loop.s).join(""), y: c.slice(loop.s, loop.t).join(""), z: c.slice(loop.t).join("") };
}

function pumpJoin(parts, i) {
  return parts.x + parts.y.repeat(i) + parts.z;
}

// ── Parse trees ──────────────────────────────────────────────────────

// A parse tree of the tokens in the grammar, or null: { tree, aborted }. A node is
// { sym, leaf?, eps?, children? }; the children of a nonterminal are in order, an ε alternative has one
// ε leaf. Built from the (complete-search) parser's run.
function pumpParseTree(g, tokens) {
  const trace = rdpRun(g, tokens, { mode: "full" });
  if (!trace.accepted) return { tree: null, aborted: trace.aborted };
  const status = rdpStateAt(trace, trace.events.length - 1).status;
  const alive = (id) => status[id] && status[id].st === "ok";
  const kidsOf = new Map();
  for (const nd of trace.nodes) {
    if (nd.parent < 0 || !alive(nd.id)) continue;
    if (!kidsOf.has(nd.parent)) kidsOf.set(nd.parent, []);
    kidsOf.get(nd.parent).push(nd);
  }
  function build(nd) {
    if (nd.kind === "tok") return nd.eps ? { sym: "ε", leaf: true, eps: true } : { sym: nd.sym, leaf: true };
    const out = [];
    for (const c of kidsOf.get(nd.id) || []) {
      if (c.kind === "alt") for (const cc of kidsOf.get(c.id) || []) out.push(build(cc));
      else out.push(build(c));
    }
    return { sym: nd.nt, children: out };
  }
  return { tree: build(trace.nodes[0]), aborted: null };
}

const pumpClone = (t) => JSON.parse(JSON.stringify(t));
function pumpGet(t, path) { let n = t; for (const k of path) n = n.children[k]; return n; }
function pumpReplace(t, path, sub) {
  if (!path.length) return sub;
  const copy = pumpClone(t);
  let n = copy;
  for (let k = 0; k < path.length - 1; k++) n = n.children[path[k]];
  n.children[path[path.length - 1]] = sub;
  return copy;
}
function pumpLeaves(t, out = []) {
  if (t.leaf) { if (!t.eps) out.push(t); }
  else for (const c of t.children) pumpLeaves(c, out);
  return out;
}
function pumpYield(t) { return pumpLeaves(t).map((l) => l.sym); }
function pumpHeight(t) { return t.leaf ? 0 : 1 + Math.max(0, ...t.children.map(pumpHeight)); }

// Every way to pick two nodes with the same nonterminal where one lies below the other and the
// parts left and right of the lower one inside the upper one are not both empty (v y ≠ ε):
// [{ up, low, size }] with the paths as child indices, preferring the lowest repeats on the longest
// paths of the tree, as the lemma's proof does.
function pumpPairs(tree) {
  const H = pumpHeight(tree);
  const all = [];
  const sizeOf = (n) => pumpYield(n).length;
  (function walk(node, path, ancestors, depth) {
    if (node.leaf) return;
    for (const a of ancestors) {
      if (a.node.sym !== node.sym) continue;
      const vy = sizeOf(a.node) - sizeOf(node);
      if (vy > 0) all.push({ up: a.path, low: path, size: sizeOf(a.node), onLongest: depth + pumpHeight(node) === H });
    }
    node.children.forEach((c, k) => walk(c, path.concat(k), ancestors.concat([{ node, path }]), depth + 1));
  })(tree, [], [], 0);
  const best = all.filter((p) => p.onLongest);
  return (best.length ? best : all).sort((p, q) => p.size - q.size || q.low.length - p.low.length);
}

// Does the leaf at `path` lie to the left of the node at `low`? (At the first position where they differ.)
function pumpLeftOf(path, low) {
  let k = 0;
  while (k < low.length && path[k] === low[k]) k++;
  return path[k] < low[k];
}

// The five parts of the yield for a pair: { u, v, x, y, z } as arrays of symbols.
function pumpDecompose(tree, pair) {
  const parts = { u: [], v: [], x: [], y: [], z: [] };
  const startsWith = (p, q) => q.every((k, i) => p[i] === k);
  (function walk(node, path) {
    if (node.leaf) {
      if (node.eps) return;
      let part;
      if (startsWith(path, pair.low)) part = "x";
      else if (startsWith(path, pair.up)) part = pumpLeftOf(path, pair.low) ? "v" : "y";
      else {
        let k = 0;
        while (k < pair.up.length && path[k] === pair.up[k]) k++;
        part = path[k] < pair.up[k] ? "u" : "z";
      }
      parts[part].push(node.sym);
      return;
    }
    node.children.forEach((c, k) => walk(c, path.concat(k)));
  })(tree, []);
  return parts;
}

// Tag the leaves of the tree with their part (u v x y z) and the two chosen nodes (mark "up" / "low"),
// on a copy; the tags survive pumping, so a pumped tree can be coloured.
function pumpTag(tree, pair) {
  const t = pumpClone(tree);
  const startsWith = (p, q) => q.every((k, i) => p[i] === k);
  (function walk(node, path) {
    if (path.length === pair.up.length && startsWith(path, pair.up)) node.mark = "up";
    if (path.length === pair.low.length && startsWith(path, pair.low)) node.mark = node.mark ? "both" : "low";
    if (node.leaf) {
      if (node.eps) return;
      if (startsWith(path, pair.low)) node.part = "x";
      else if (startsWith(path, pair.up)) node.part = pumpLeftOf(path, pair.low) ? "v" : "y";
      else {
        let k = 0;
        while (k < pair.up.length && path[k] === pair.up[k]) k++;
        node.part = path[k] < pair.up[k] ? "u" : "z";
      }
      return;
    }
    node.children.forEach((c, k) => walk(c, path.concat(k)));
  })(t, []);
  return t;
}

// The tree with the middle part (from the upper node down to the lower one) repeated i times: i = 1 is the
// original, i = 0 replaces the upper subtree by the lower one.
function pumpTree(tree, pair, i) {
  const up = pumpGet(tree, pair.up);
  const rel = pair.low.slice(pair.up.length);
  let cur = pumpClone(pumpGet(tree, pair.low));
  for (let k = 0; k < i; k++) cur = pumpReplace(pumpClone(up), rel, cur);
  return pumpReplace(tree, pair.up, cur);
}
