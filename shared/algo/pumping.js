// Pure helpers for the pumping explorer: why long strings of a regular language can be pumped
// (a repeated state in a DFA's path) and why long strings of a context-free language can be pumped
// (a repeated nonterminal on a path of a parse tree), and how to turn that around to refute a
// machine or grammar that claims to recognise a language that cannot be pumped. No DOM access.
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

// ── Languages to refute ──────────────────────────────────────────────

const PUMP_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53];
const pumpCount = (s, ch) => [...s].filter((c) => c === ch).length;
const pumpRep = (ch, n) => ch.repeat(n);

// Each language: label, regular (true for the one that can be pumped), member(string),
// samples(n) → strings of the language that grow with n.
const PUMP_TARGETS = {
  anbn: {
    label: "aⁿbⁿ", regular: false,
    member: (s) => /^a*b*$/.test(s) && pumpCount(s, "a") === pumpCount(s, "b"),
    samples: (n) => [pumpRep("a", n) + pumpRep("b", n)],
  },
  equal: {
    label: "equal numbers of a and b", regular: false,
    member: (s) => /^[ab]*$/.test(s) && pumpCount(s, "a") === pumpCount(s, "b"),
    samples: (n) => [pumpRep("a", n) + pumpRep("b", n), pumpRep("ab", n)],
  },
  anbncn: {
    label: "aⁿbⁿcⁿ", regular: false,
    member: (s) => /^a*b*c*$/.test(s) && pumpCount(s, "a") === pumpCount(s, "b") && pumpCount(s, "b") === pumpCount(s, "c"),
    samples: (n) => [pumpRep("a", n) + pumpRep("b", n) + pumpRep("c", n)],
  },
  ww: {
    label: "ww (a word repeated)", regular: false,
    member: (s) => s.length % 2 === 0 && s.slice(0, s.length / 2) === s.slice(s.length / 2),
    samples: (n) => [pumpRep("a", n) + "b" + pumpRep("a", n) + "b", pumpRep("a", n) + "b" + pumpRep("a", 2 * n) + "b" + pumpRep("a", n), pumpRep("a", 2 * n)],
  },
  squares: {
    label: "aⁿ with n a perfect square", regular: false,
    member: (s) => /^a*$/.test(s) && Number.isInteger(Math.sqrt(s.length)),
    samples: (n) => [pumpRep("a", n * n)],
  },
  primes: {
    label: "aⁿ with n prime", regular: false,
    member: (s) => { const n = s.length; if (!/^a*$/.test(s) || n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; },
    samples: (n) => [pumpRep("a", PUMP_PRIMES[Math.min(n - 1, PUMP_PRIMES.length - 1)])],
  },
  evena: {
    label: "an even number of a's", regular: true,
    member: (s) => pumpCount(s, "a") % 2 === 0,
    samples: (n) => [pumpRep("a", 2 * n), pumpRep("ab", 2 * n)],
  },
};

// ── Refuting a DFA ───────────────────────────────────────────────────

// Does the DFA recognise the language `key` of PUMP_TARGETS? Looks for a proof that it does not:
//   kind "misses"  — a string of the language that the DFA rejects: { w }
//   kind "pumped"  — a string w of the language that the DFA accepts, at least as long as the DFA has
//                    states; its path repeats a state, and pumping the loop gives a string the DFA
//                    accepts (it ends in the same state) that is not in the language:
//                    { w, loop, parts, i, pumped }
//   kind "differs" — neither, but a short string on which they disagree: { w, inLanguage }
//   kind "none"    — nothing found: the DFA may be right.
function pumpRefuteDFA(dfa, key) {
  const T = PUMP_TARGETS[key];
  const k = dfa.states.length;
  const MAX_N = 40, MAX_LEN = 80;
  for (let n = 1; n <= MAX_N; n++) {
    for (const w of T.samples(n)) {
      if (w.length > MAX_LEN) continue;
      if (!pumpDFARun(dfa, w).accepted) return { kind: "misses", w };
    }
  }
  for (let n = 1; n <= MAX_N; n++) {
    for (const w of T.samples(n)) {
      if (w.length < k || w.length > MAX_LEN) continue;
      const run = pumpDFARun(dfa, w);
      const loop = pumpFindLoop(run.path);
      if (!loop) continue;
      const parts = pumpSplit(w, loop);
      const top = Math.max(4, w.length + 2);
      for (const i of [2, 0, ...Array.from({ length: top - 2 }, (_, k) => k + 3)]) {
        const pumped = pumpJoin(parts, i);
        if (pumped.length > 4000) break;
        if (!T.member(pumped) && pumpDFARun(dfa, pumped).accepted) return { kind: "pumped", w, loop, parts, i, pumped, path: run.path };
      }
    }
  }
  // Short disagreements, by brute force.
  const alpha = dfa.alpha.length ? dfa.alpha : ["a"];
  let level = [""];
  for (let len = 0; len <= 7; len++) {
    for (const s of level) {
      const inM = pumpDFARun(dfa, s).accepted, inT = T.member(s);
      if (inM !== inT) return { kind: "differs", w: s, inLanguage: inT };
    }
    level = level.flatMap((s) => alpha.map((a) => s + a));
    if (level.length > 20000) break;
  }
  return { kind: "none" };
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

// The five parts of the yield for a pair: { u, v, x, y, z } as arrays of symbols.
function pumpDecompose(tree, pair) {
  const parts = { u: [], v: [], x: [], y: [], z: [] };
  const startsWith = (p, q) => q.every((k, i) => p[i] === k);
  (function walk(node, path) {
    if (node.leaf) {
      if (node.eps) return;
      let part;
      if (startsWith(path, pair.low)) part = "x";
      else if (startsWith(path, pair.up)) part = path[pair.up.length] < pair.low[pair.up.length] ? "v" : "y";
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
      else if (startsWith(path, pair.up)) node.part = path[pair.up.length] < pair.low[pair.up.length] ? "v" : "y";
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

// ── Refuting a grammar ───────────────────────────────────────────────

// Does the grammar generate the language `key`? As pumpRefuteDFA, for single-letter terminals:
//   kind "misses"      — a string of the language that the grammar does not generate: { w }
//   kind "pumped"      — a string w of the language that the grammar generates, with a parse tree that repeats a
//                        nonterminal on a path; pumping the repeat gives a string the grammar generates that is
//                        not in the language: { w, tree, pair, parts, i, pumped }
//   kind "differs"     — no pumping found, but a short string the grammar generates that is not in the language: { w }
//   kind "unsupported" — the grammar cannot be handled: { reason }
//   kind "none"        — nothing found.
function pumpRefuteGrammar(g, key) {
  const T = PUMP_TARGETS[key];
  if ([...g.terminals].some((t) => [...t].length !== 1)) return { kind: "unsupported", reason: "The languages to refute are over the letters a, b and c: use single-letter terminals." };
  const rec = rdpLeftRecursive(g);
  if (rec.length) return { kind: "unsupported", reason: "The grammar is left-recursive (" + rec.join(", ") + "), which the parser used here cannot handle. Remove the left recursion first." };
  let misses = null;
  for (let n = 1; n <= 8; n++) {
    for (const w of T.samples(n)) {
      const r = pumpParseTree(g, [...w]);
      if (!r.tree) { if (!r.aborted && misses === null) misses = w; continue; }
      for (const pair of pumpPairs(r.tree).slice(0, 6)) {
        for (const i of [2, 0, 3, 4]) {
          const pumped = pumpYield(pumpTree(r.tree, pair, i)).join("");
          if (!T.member(pumped)) return { kind: "pumped", w, tree: r.tree, pair, parts: pumpDecompose(r.tree, pair), i, pumped };
        }
      }
    }
  }
  if (misses !== null) return { kind: "misses", w: misses };
  // Pumping the trees of members found nothing (the grammar may generate too much in a way these trees do
  // not show): look for a short string the grammar generates that is not in the language.
  const alpha = [...g.terminals].sort();
  let level = [""];
  for (let len = 1, tried = 0; len <= 6 && tried < 3000; len++) {
    level = level.flatMap((s) => alpha.map((a) => s + a));
    for (const w of level) {
      tried++;
      if (T.member(w)) continue;
      if (pumpParseTree(g, [...w]).tree) return { kind: "differs", w, inLanguage: false };
    }
  }
  return { kind: "none" };
}
