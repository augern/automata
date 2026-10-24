// Pure engine of the scanner tool: token rules (name, pattern, skip) → one NFA for all rules with character-set edges →
// the alphabet cut into character classes → the minimal DFA over those classes → longest-match scanning, with a frame
// for every character read. No DOM access. Independent of regex.js: a pattern is parsed here, so that [a-z], [^"] and .
// stay one edge each instead of a union of single characters.
//
// Pattern syntax: | * + ? ( ), [a-z0-9_] classes with ranges, [^…] negated classes, . (any character but a newline),
// \n \t, and \c for a special character c. Everything else stands for itself.

// ── Token rules ──────────────────────────────────────────────────────

// Rules, one per line: `name  pattern  [-> skip]`. The name is quoted when it has special characters ('+'). Earlier
// rules win ties. `-> skip` rules (white space, comments) produce no token. // starts a comment line.
function scnParseRules(text) {
  const rules = [];
  text.split("\n").forEach((raw, ln) => {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("//")) return;
    const m = /^\s*(?:'((?:[^']|'')+)'|"((?:[^"]|"")+)"|(\S+))\s+(.*\S)\s*$/.exec(line);
    if (!m) throw new Error("Line " + (ln + 1) + ": expected  name  pattern");
    const name = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2] !== undefined ? m[2].replace(/""/g, '"') : m[3];
    let pattern = m[4], skip = false;
    const sk = /\s+->\s*skip$/.exec(pattern);
    if (sk) { skip = true; pattern = pattern.slice(0, sk.index); }
    rules.push({ name, pattern: pattern.trim(), skip });
  });
  if (!rules.length) throw new Error("No token rules");
  return rules;
}

// ── Patterns ─────────────────────────────────────────────────────────

// The character that stands for every character that no rule mentions ("any other").
const SCN_OTHER = "";

// A pattern as a tree: { t: "set", chars: [c], neg } | { t: "cat" | "alt", parts } | { t: "star" | "plus" | "opt", x } | { t: "empty" }.
function scnParsePattern(p) {
  let i = 0;
  const esc = (c) => (c === "t" ? "\t" : c === "n" ? "\n" : c);
  const fail = (msg) => { throw new Error(msg); };
  function alt() {
    const parts = [cat()];
    while (p[i] === "|") { i++; parts.push(cat()); }
    return parts.length === 1 ? parts[0] : { t: "alt", parts };
  }
  function cat() {
    const parts = [];
    while (i < p.length && p[i] !== "|" && p[i] !== ")") parts.push(rep());
    return parts.length === 0 ? { t: "empty" } : parts.length === 1 ? parts[0] : { t: "cat", parts };
  }
  function rep() {
    let x = atom();
    while (p[i] === "*" || p[i] === "+" || p[i] === "?") { x = { t: p[i] === "*" ? "star" : p[i] === "+" ? "plus" : "opt", x }; i++; }
    return x;
  }
  function atom() {
    const c = p[i];
    if (c === "(") {
      i++;
      const x = alt();
      if (p[i] !== ")") fail("Missing ) in " + p);
      i++;
      return x;
    }
    if (c === "[") return cls();
    if (c === ".") { i++; return { t: "set", chars: ["\n"], neg: true }; }
    if (c === "\\") {
      if (i + 1 >= p.length) fail("Trailing \\ in " + p);
      const ch = esc(p[i + 1]);
      i += 2;
      return { t: "set", chars: [ch], neg: false };
    }
    if (c === "*" || c === "+" || c === "?") fail("Nothing before " + c + " in " + p);
    i++;
    return { t: "set", chars: [c], neg: false };
  }
  function cls() {
    i++; // [
    let neg = false;
    if (p[i] === "^") { neg = true; i++; }
    const chars = [];
    const one = () => {
      let ch = p[i];
      if (ch === "\\") { if (i + 1 >= p.length) fail("Trailing \\ in " + p); ch = esc(p[i + 1]); i += 2; } else i++;
      return ch;
    };
    while (i < p.length && p[i] !== "]") {
      const lo = one();
      if (p[i] === "-" && i + 1 < p.length && p[i + 1] !== "]") {
        i++;
        const hi = one();
        if (hi.charCodeAt(0) < lo.charCodeAt(0)) fail("Backwards range " + lo + "-" + hi + " in " + p);
        for (let c = lo.charCodeAt(0); c <= hi.charCodeAt(0); c++) chars.push(String.fromCharCode(c));
      } else chars.push(lo);
    }
    if (p[i] !== "]") fail("Unterminated [ in " + p);
    i++;
    if (!chars.length && !neg) fail("Empty class in " + p);
    return { t: "set", chars: [...new Set(chars)], neg };
  }
  if (!p.trim()) fail("Empty pattern");
  const tree = alt();
  if (i < p.length) fail("Unexpected ) in " + p);
  return tree;
}

// The error of a pattern, or null.
function scnPatternError(p) {
  try { scnParsePattern(p); return null; } catch (e) { return e.message; }
}

// One character as shown: control and blank characters by name.
function scnShowChar(c) {
  if (c === SCN_OTHER) return "other";
  if (c === " ") return "␣";
  if (c === "\n") return "\\n";
  if (c === "\t") return "\\t";
  if (c === "\r") return "\\r";
  return c;
}

// A set of characters as short text: runs of three or more as ranges (a-z).
function scnShowChars(chars) {
  const cs = [...chars].filter((c) => c !== SCN_OTHER).sort();
  const parts = [];
  for (let k = 0; k < cs.length; ) {
    let j = k;
    while (j + 1 < cs.length && cs[j + 1].charCodeAt(0) === cs[j].charCodeAt(0) + 1) j++;
    if (j - k >= 2) parts.push(scnShowChar(cs[k]) + "-" + scnShowChar(cs[j]));
    else for (let m = k; m <= j; m++) parts.push(scnShowChar(cs[m]));
    k = j + 1;
  }
  return parts.join("");
}

// The label of a character set of the NFA: a single character as it is, a class in brackets.
function scnSetLabel(set) {
  if (set.neg) return set.chars.length === 1 && set.chars[0] === "\n" ? "." : "[^" + scnShowChars(set.chars) + "]";
  return set.chars.length === 1 ? scnShowChar(set.chars[0]) : "[" + scnShowChars(set.chars) + "]";
}

// ── The NFA of all rules ─────────────────────────────────────────────

// Thompson's construction with character-set edges, one fragment per rule under a common start state 0.
// { n, edges: [{ from, to, set | null }] (null: ε), accept: Map(state → rule), rules, alphabet: [c] }
function scnBuildNFA(rules) {
  const trees = rules.map((r) => {
    try { return scnParsePattern(r.pattern); } catch (e) { throw new Error("Token " + r.name + ": " + e.message); }
  });
  const alpha = new Set();
  const collect = (t) => { if (t.t === "set") t.chars.forEach((c) => alpha.add(c)); else if (t.parts) t.parts.forEach(collect); else if (t.x) collect(t.x); };
  trees.forEach(collect);
  const edges = [], accept = new Map();
  let n = 1;
  const fresh = () => n++;
  const link = (from, to, set) => edges.push({ from, to, set: set || null });
  function build(t) {
    const s = fresh(), e = fresh();
    if (t.t === "set") link(s, e, t);
    else if (t.t === "empty") link(s, e);
    else if (t.t === "cat") {
      let at = s;
      for (const p of t.parts) { const f = build(p); link(at, f.s); at = f.e; }
      link(at, e);
    } else if (t.t === "alt") for (const p of t.parts) { const f = build(p); link(s, f.s); link(f.e, e); }
    else {
      const f = build(t.x);
      link(s, f.s);
      link(f.e, e);
      if (t.t === "star" || t.t === "plus") link(f.e, f.s);
      if (t.t === "star" || t.t === "opt") link(s, e);
    }
    return { s, e };
  }
  trees.forEach((t, k) => {
    const f = build(t);
    link(0, f.s);
    accept.set(f.e, k);
  });
  return { n, edges, accept, rules, alphabet: [...alpha].sort() };
}

// ── Character classes ────────────────────────────────────────────────

// Does the set contain the character (SCN_OTHER stands for every character the rules do not mention)?
const scnInSet = (set, c) => (set.neg ? !set.chars.includes(c) : set.chars.includes(c));

// The alphabet cut into the classes that no set of the NFA tells apart: characters with the same membership in every
// set. [{ chars: [c] }], the class of SCN_OTHER included.
function scnAtoms(nfa) {
  const sets = [];
  const seen = new Set();
  for (const e of nfa.edges) if (e.set) {
    const key = (e.set.neg ? "^" : "") + e.set.chars.join("");
    if (!seen.has(key)) { seen.add(key); sets.push(e.set); }
  }
  const groups = new Map();
  for (const c of [...nfa.alphabet, SCN_OTHER]) {
    const sig = sets.map((s) => (scnInSet(s, c) ? 1 : 0)).join("");
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(c);
  }
  return [...groups.values()].map((chars) => ({ chars }));
}

// ── The DFA ──────────────────────────────────────────────────────────

// Subset construction over the classes, then minimisation that starts from the partition by token (so two states that
// accept different tokens are never merged), then classes that behave alike in every state are merged.
//   states:  [{ id, accept: rule | -1, rules: [rule] (every rule that accepts there: more than one is a conflict) }]
//   classes: [{ chars, label }]   trans[state][class] = state | -1 (dead)
//   classOf(c) = class of a character (a character no rule mentions is in the class of "other")
function scnBuildDFA(nfa) {
  const atoms = scnAtoms(nfa);
  const eps = Array.from({ length: nfa.n }, () => []);
  const out = Array.from({ length: nfa.n }, () => []);
  for (const e of nfa.edges) (e.set ? out : eps)[e.from].push(e);
  const closure = (set) => {
    const stack = [...set], res = new Set(set);
    while (stack.length) for (const e of eps[stack.pop()]) if (!res.has(e.to)) { res.add(e.to); stack.push(e.to); }
    return res;
  };
  const key = (s) => [...s].sort((a, b) => a - b).join(",");
  const subsets = [], index = new Map(), raw = [];
  const add = (s) => {
    const k = key(s);
    if (!index.has(k)) { index.set(k, subsets.length); subsets.push(s); raw.push([]); }
    return index.get(k);
  };
  add(closure(new Set([0])));
  for (let q = 0; q < subsets.length; q++) {
    atoms.forEach((a, ai) => {
      const c = a.chars[0], next = new Set();
      for (const s of subsets[q]) for (const e of out[s]) if (scnInSet(e.set, c)) next.add(e.to);
      raw[q][ai] = next.size ? add(closure(next)) : -1;
    });
  }
  const rulesOf = (s) => [...new Set([...s].filter((x) => nfa.accept.has(x)).map((x) => nfa.accept.get(x)))].sort((a, b) => a - b);
  const acc = subsets.map(rulesOf);
  // Moore's refinement, from the partition by accepted token
  let block = acc.map((r) => (r.length ? r[0] + 1 : 0)); // 0: accepts nothing (a dead transition is -1)
  for (;;) {
    const sigs = new Map();
    const next = raw.map((row, q) => {
      const sig = block[q] + "|" + row.map((t) => (t < 0 ? -1 : block[t])).join(",");
      if (!sigs.has(sig)) sigs.set(sig, sigs.size);
      return sigs.get(sig);
    });
    const same = new Set(next).size === new Set(block).size;
    block = next;
    if (same) break;
  }
  // number the blocks from the start state in breadth-first order
  const order = new Map();
  const queue = [0];
  order.set(block[0], 0);
  const rep = new Map([[block[0], 0]]);
  for (let h = 0; h < queue.length; h++) {
    for (const t of raw[queue[h]]) if (t >= 0 && !order.has(block[t])) { order.set(block[t], order.size); rep.set(block[t], t); queue.push(t); }
  }
  const nS = order.size;
  const states = [], atomTrans = [];
  for (const [b, id] of order) {
    const q = rep.get(b);
    states[id] = { id, accept: acc[q].length ? acc[q][0] : -1, rules: acc[q] };
    atomTrans[id] = raw[q].map((t) => (t < 0 ? -1 : order.get(block[t])));
  }
  // merge the classes that behave alike in every state
  const cols = new Map(), classes = [];
  const classOfAtom = atoms.map((a, ai) => {
    const k = atomTrans.map((row) => row[ai]).join(",");
    if (!cols.has(k)) { cols.set(k, classes.length); classes.push({ chars: [] }); }
    classes[cols.get(k)].chars.push(...a.chars);
    return cols.get(k);
  });
  const trans = atomTrans.map((row) => {
    const r = [];
    row.forEach((t, ai) => { r[classOfAtom[ai]] = t; });
    return r;
  });
  classes.forEach((c) => {
    c.chars.sort();
    const named = c.chars.filter((x) => x !== SCN_OTHER);
    const other = c.chars.includes(SCN_OTHER);
    c.label = (named.length ? (named.length === 1 ? scnShowChar(named[0]) : "[" + scnShowChars(named) + "]") : "") + (other ? (named.length ? " + other" : "other") : "");
  });
  const byChar = new Map();
  classes.forEach((c, k) => c.chars.forEach((x) => byChar.set(x, k)));
  const otherClass = byChar.get(SCN_OTHER);
  return { states, classes, trans, n: nS, classOf: (c) => (byChar.has(c) ? byChar.get(c) : otherClass), atomCount: atoms.length };
}

// ── The scanner: the rules, the NFA, the DFA ─────────────────────────

// Throws an Error with a message on a bad pattern.
function scnCompile(text) {
  const rules = scnParseRules(text);
  const nfa = scnBuildNFA(rules);
  const dfa = scnBuildDFA(nfa);
  // a rule that never wins: no state accepts it as its token
  const wins = new Set(dfa.states.map((s) => s.accept));
  const shadowed = rules.map((r, k) => k).filter((k) => !wins.has(k));
  const conflicts = dfa.states.filter((s) => s.rules.length > 1).map((s) => s.id);
  return { rules, nfa, dfa, shadowed, conflicts };
}

// One call of the scanner at pos of chars: the longest lexeme any rule matches (the earliest rule on a tie).
//   rule   the token rule | -1 (no rule matches: a lexical error) | -2 (the end of the input)
//   start, end   the lexeme [start, end); readTo how far the scanner looked (exclusive)
//   steps  [{ i, ch, from, to, rule }] one per character read; to = -1: no transition (the dead end)
//   last   { state, end, rule } the last accepting state seen, or null
function scnScan(dfa, chars, pos) {
  if (pos >= chars.length) return { rule: -2, start: pos, end: pos, readTo: pos, steps: [], last: null };
  let q = 0, i = pos, best = null, readTo = pos;
  const steps = [];
  for (;;) {
    if (i >= chars.length) break;
    const t = dfa.trans[q][dfa.classOf(chars[i])];
    readTo = i + 1;
    if (t < 0) { steps.push({ i, ch: chars[i], from: q, to: -1, rule: null }); break; }
    steps.push({ i, ch: chars[i], from: q, to: t, rule: dfa.states[t].accept >= 0 ? dfa.states[t].accept : null });
    q = t;
    i++;
    if (dfa.states[q].accept >= 0) best = { state: q, end: i, rule: dfa.states[q].accept };
  }
  if (!best) return { rule: -1, start: pos, end: pos + 1, readTo: Math.max(readTo, pos + 1), steps, last: null };
  return { rule: best.rule, start: pos, end: best.end, readTo: Math.max(readTo, best.end), steps, last: best };
}

// ── The run ──────────────────────────────────────────────────────────

const SCN_MAX_FRAMES = 3000;

// The scanner on `input`, until the end. Frames, one per event (fine: true for the ones that are one character each):
//   type   start | read | stop | token | skip | error | end
//   msg    what happened, in words
//   begin  where the lexeme begins; forward  how far the scanner has read (the characters before it are consumed)
//   state  the DFA state the scanner is in (null: not in a call)
//   path   the states the call has been through; edges: [[from, to]] the transitions it has taken
//   last   { state, end, rule } the last accepting state seen in this call, or null
//   tokens [{ name, lexeme, start, end }] returned so far
function scnRun(sc, input) {
  const { dfa, rules } = sc;
  const chars = [...input];
  const frames = [], tokens = [];
  const push = (f) => frames.push(JSON.parse(JSON.stringify({ state: null, path: [], edges: [], last: null, ...f, tokens })));
  push({ type: "start", fine: false, msg: "Start: the scanner is at the start of the input.", begin: 0, forward: 0 });
  let pos = 0;
  for (let guard = 0; guard < 5000 && frames.length < SCN_MAX_FRAMES; guard++) {
    const r = scnScan(dfa, chars, pos);
    if (r.rule === -2) { push({ type: "end", fine: false, msg: "The scanner is at the end of the input: it returns $.", begin: pos, forward: pos }); break; }
    const path = [0], edges = [];
    let last = null;
    for (const s of r.steps) {
      if (s.to < 0) {
        push({ type: "stop", fine: true, msg: "No transition on " + JSON.stringify(s.ch) + " from state " + s.from + ": the scanner stops" + (last ? " and backs up to the end of the last accepting state, " + last.state + "." : "."), begin: pos, forward: s.i + 1, state: s.from, path: [...path], edges: edges.map((e) => [...e]), last, dead: true });
        continue;
      }
      path.push(s.to);
      edges.push([s.from, s.to]);
      if (s.rule !== null) last = { state: s.to, end: s.i + 1, rule: s.rule };
      push({ type: "read", fine: true, msg: "Read " + JSON.stringify(s.ch) + ": state " + s.from + " → " + s.to + (s.rule !== null ? ", which accepts " + rules[s.rule].name + "." : "."), begin: pos, forward: s.i + 1, state: s.to, path: [...path], edges: edges.map((e) => [...e]), last });
    }
    if (!r.steps.length || r.steps[r.steps.length - 1].to >= 0) {
      // ran into the end of the input
      if (r.steps.length) push({ type: "stop", fine: true, msg: "The end of the input: the scanner stops" + (last ? " and returns the last accepting state's token." : "."), begin: pos, forward: chars.length, state: path[path.length - 1], path: [...path], edges: edges.map((e) => [...e]), last, dead: true });
    }
    const lexeme = chars.slice(r.start, r.end).join("");
    if (r.rule === -1) {
      push({ type: "error", fine: false, msg: "Lexical error: no token rule matches at position " + r.start + " (the character " + JSON.stringify(chars[r.start]) + "). The scanner skips it.", begin: pos, forward: r.end, state: r.steps.length ? r.steps[0].from : 0, path, edges, last: null });
    } else if (rules[r.rule].skip) {
      push({ type: "skip", fine: false, msg: "The scanner consumes " + JSON.stringify(lexeme) + " by the rule " + rules[r.rule].name + " and discards it.", begin: pos, forward: r.end, state: r.last.state, path, edges, last: r.last });
    } else {
      tokens.push({ name: rules[r.rule].name, lexeme, start: r.start, end: r.end });
      push({ type: "token", fine: false, msg: "The scanner returns the token " + rules[r.rule].name + " for " + JSON.stringify(lexeme) + (r.readTo > r.end ? ", after reading " + JSON.stringify(chars.slice(r.end, r.readTo).join("")) + " beyond it and backing up." : "."), begin: pos, forward: r.end, state: r.last.state, path, edges, last: r.last });
    }
    pos = r.end;
  }
  return { frames, chars };
}
