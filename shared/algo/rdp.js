// Pure model of a backtracking recursive-descent parser. No DOM access. Depends on grammar.js
// (parseBNF, EPSILON, esc, computeFirst/Follow) and ll1.js (buildLL1Table).
//
// rdpRun runs the parser and records everything it does as a list of events. The tool never
// executes anything itself: the code listing, the input position, the call tree and the
// explanations are all derived from the events up to the current step.
//
// Without backtracking (mode "predictive"): the classic recursive-descent parser for an LL(1) grammar. A procedure
// looks at the next token and picks the one alternative whose predict set contains it (FIRST of the right side, or
// FOLLOW of the nonterminal for an empty one); it never tries and undoes. A token that predicts nothing, or a terminal
// that does not match, is a syntax error and ends the run. If the grammar is not LL(1) two alternatives are predicted
// by the same token, and the parser commits to the first.
//
// Three ways of backtracking (mode):
//   "full"    — complete search: a nonterminal can yield every position where it may end, and
//               when the rest of the parse fails the parser returns into it for the next one.
//   "ordered" — ordered choice (as in PEG parsers): the first alternative that matches wins and
//               is never revisited. Simpler and faster, but it can reject strings that are in the
//               language.
//   "packrat" — ordered choice that remembers the result of every (nonterminal, position) it has
//               finished, and reuses it instead of parsing the same thing again.
//
// Tree nodes: { id, kind: "call" | "alt" | "tok", parent, ... } (see mk* below). A node's status
// changes over time and is not stored on it: rdpStateAt replays the events.
//   open  — being worked on         ok   — matched / succeeded (for now)
//   fail  — failed right here       dead — undone by backtracking
//
// Event: { kind, node, pos, line, depth, text, add?, set?, kill?, altIdx? }
//   kind  call | try | choose | match | mismatch | yield | reject | fail | memo | accept | leftover | loop | limit
//         (choose: the predictive parser picks an alternative by the next token; nothing is undone later)
//   pos   input position (tokens read) after the event; line: key of the code line (rdpKey) or null
//   Applied in this order: kill (every node with id >= kill that is alive becomes dead), add
//   (new nodes, status open), set ([id, status, end?] triples).

const RDP_MAX_EVENTS = 3000;
const RDP_MAX_DEPTH = 80;

// ── Grammar ──────────────────────────────────────────────────────────

// Context-free grammar with its alternatives in the order written: the order is what the parser tries.
function rdpParseGrammar(text) {
  const base = parseBNF(text, false);
  for (const r of base.rules) {
    if (/\s/.test(r.lhs)) throw new Error("The left side must be a single nonterminal: " + r.lhs);
  }
  const alts = {};
  const order = [];
  base.rules.forEach((r, idx) => {
    if (!alts[r.lhs]) { alts[r.lhs] = []; order.push(r.lhs); }
    alts[r.lhs].push({ rule: idx, rhs: r.rhs });
  });
  const terminals = new Set([...base.terminals].filter((t) => t !== "$"));
  return { base, rules: base.rules, start: base.start, nonterminals: base.nonterminals, terminals, alts, order };
}

// The predictive parser's table (algo/ll1.js) as it concerns the alternatives: { table, sets, clashes } where
// sets[nt][a] is the set of tokens that predict alternative a of nt ($ is the end of the input), and clashes lists the
// tokens that predict several alternatives (the grammar is not LL(1)): [{ nt, sym, alts: [a] }].
function rdpPredict(g) {
  if (g._predict) return g._predict;
  const first = computeFirst(g.base), follow = computeFollow(g.base, first);
  const { table, conflicts } = buildLL1Table(g.base, first, follow);
  const where = new Map();
  for (const nt of g.order) g.alts[nt].forEach((al, a) => where.set(al.rule, [nt, a]));
  const sets = {};
  for (const nt of g.order) sets[nt] = g.alts[nt].map(() => new Set());
  for (const nt of g.order) for (const [sym, cell] of Object.entries(table[nt] || {})) for (const r of Array.isArray(cell) ? cell : [cell]) sets[nt][where.get(r)[1]].add(sym);
  const clashes = conflicts.map((c) => ({ nt: c.nt, sym: c.sym, alts: c.rules.map((r) => where.get(r)[1]).sort((x, y) => x - y) }));
  g._predict = { first, follow, table, sets, clashes };
  return g._predict;
}

// Input string to tokens (see strTokenise in strings.js).
function rdpTokenise(g, str) { return strTokenise(g.terminals, str); }

// Nonterminals that can derive themselves as the first symbol (left recursion), directly or
// through nullable prefixes. A top-down parser never returns from these.
function rdpLeftRecursive(g) {
  const nts = g.nonterminals;
  const nullable = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of g.rules) {
      if (!nullable.has(r.lhs) && r.rhs.every((s) => nullable.has(s))) { nullable.add(r.lhs); changed = true; }
    }
  }
  const next = {};
  for (const nt of nts) next[nt] = new Set();
  for (const r of g.rules) {
    for (const s of r.rhs) {
      if (nts.has(s)) next[r.lhs].add(s);
      if (!nullable.has(s)) break;
    }
  }
  const bad = [];
  for (const nt of g.order) {
    const seen = new Set();
    const stack = [...next[nt]];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      for (const y of next[x]) stack.push(y);
    }
    if (seen.has(nt)) bad.push(nt);
  }
  return bad;
}

// ── Code lines ───────────────────────────────────────────────────────

// Key of a line of the generated procedures. part: head | memo | alt | sym | end.
// sym with k = the right-hand side's length is the line that yields/returns.
function rdpKey(nt, part, a, k) {
  if (part === "head") return nt + "\u0001h";
  if (part === "memo") return nt + "\u0001m";
  if (part === "end") return nt + "\u0001e";
  if (part === "alt") return nt + "\u0001a" + a;
  return nt + "\u0001s" + a + "." + k;
}

const RDP_SUB = "₀₁₂₃₄₅₆₇₈₉";
function rdpSub(n) {
  return String(n).split("").map((d) => RDP_SUB[+d]).join("");
}

// The procedures of the grammar as data: [{ nt, lines: [{ key, indent, kind, note, segs: [[cls, text]] }] }].
// kind: head | alt | sym | yield | end; note says in a sentence why the line is generated (the build stepper shows it).
// cls: kw (keyword) | nt | t (terminal) | cm (comment) | "" (plain).
function rdpProcedures(g, mode) {
  if (mode === "predictive") return rdpPredictiveProcedures(g);
  const procs = [];
  const ordered = mode === "ordered" || mode === "packrat";
  const memo = mode === "packrat";
  const jv = (k) => (k === 0 ? "i" : "j" + rdpSub(k));
  const symSeg = (s) => [g.nonterminals.has(s) ? "nt" : "t", s];
  for (const nt of g.order) {
    const alts = g.alts[nt];
    const multi = alts.length > 1;
    const lines = [];
    const add = (key, indent, kind, note, segs) => lines.push({ key, indent, kind, note, segs });
    add(rdpKey(nt, "head"), 0, "head",
      "Procedure " + nt + "(i): " + (ordered ? "it returns where its first matching alternative ends, or ✗." : "it yields every position where " + nt + " can end."), [
      ["nt", nt], ["", "(i)  "],
      ["cm", ordered ? "▷ end j of the first alternative that matches, or ✗" : "▷ yields each j where " + nt + " matches input[i…j)"],
    ]);
    if (memo) {
      add(rdpKey(nt, "memo"), 1, "memo", "Packrat: first look in the memo table. If " + nt + " was already tried at this position, return the remembered result (an end position, or ✗) without parsing again.", [
        ["kw", "if"], ["", " ("], ["nt", nt], ["", ", i) ∈ memo  "], ["kw", "return"], ["", " memo("], ["nt", nt], ["", ", i)"],
      ]);
    }
    alts.forEach((alt, a) => {
      const base = multi ? 2 : 1;
      if (multi) {
        add(rdpKey(nt, "alt", a), 1, "alt", "Alternative " + (a + 1) + " of " + nt + ": " + nt + " → " + (alt.rhs.join(" ") || "ε") + ". The alternatives are tried in the order written.", [
          ["kw", "alt " + (a + 1)], ["", "  "], ["nt", nt], ["", " → "],
          ...(alt.rhs.length ? alt.rhs.flatMap((s, x) => (x ? [["", " "], symSeg(s)] : [symSeg(s)])) : [["cm", "ε"]]),
        ]);
      }
      alt.rhs.forEach((s, k) => {
        const isNt = g.nonterminals.has(s);
        const note = isNt
          ? s + " is a nonterminal: " + (ordered ? "call its procedure at the current position; a ✗ gives up this alternative." : "call its procedure and loop over every position it yields.")
          : "“" + s + "” is a terminal: " + (ordered ? "match it at the current position; ✗ if the token differs." : "it yields the next position if the token matches, and nothing otherwise.");
        const call = g.nonterminals.has(s) ? [["nt", s], ["", "(" + jv(k) + ")"]] : [["kw", "match"], ["", "("], ["t", s], ["", ", " + jv(k) + ")"]];
        if (ordered) add(rdpKey(nt, "sym", a, k), base, "sym", note, [["", jv(k + 1) + " ← "], ...call]);
        else add(rdpKey(nt, "sym", a, k), base + k, "sym", note, [["kw", "for"], ["", " " + jv(k + 1) + " "], ["kw", "in"], ["", " "], ...call]);
      });
      const len = alt.rhs.length;
      const done = !len ? "The alternative is empty: it matches without reading anything. "
        : "Every symbol matched. ";
      if (memo) add(rdpKey(nt, "sym", a, len), base, "yield", done + "Remember the position reached in the memo table, then return it; the choice is final.", [["", "memo("], ["nt", nt], ["", ", i) ← " + jv(len) + ";  "], ["kw", "return"], ["", " " + jv(len)]]);
      else if (ordered) add(rdpKey(nt, "sym", a, len), base, "yield", done + "Return the position reached; the choice is final.", [["kw", "return"], ["", " " + jv(len)]]);
      else add(rdpKey(nt, "sym", a, len), base + len, "yield", done + "Yield the position reached; if the caller rejects it, control returns into the loops above for the next way.", [["kw", "yield"], ["", " " + jv(len)]]);
    });
    add(rdpKey(nt, "end"), 1, "end",
      ordered ? (memo ? "No alternative matched: remember the failure in the memo table and return ✗." : "No alternative matched: return ✗.") : "No way left: the procedure ends, and " + nt + " fails.",
      ordered
        ? (memo ? [["", "memo("], ["nt", nt], ["", ", i) ← ✗;  "], ["kw", "return"], ["", " ✗"]] : [["kw", "return"], ["", " ✗  "], ["cm", "▷ no alternative matched"]])
        : [["cm", "▷ no way left: " + nt + " fails"]]);
    procs.push({ nt, lines });
  }
  return procs;
}

// ── The grammar text ─────────────────────────────────────────────────

// Where each production (in the order of g.rules) sits in the grammar text, as [start, end) offsets:
// { lhs, rhs, toks } with toks the offsets of the symbols of the right-hand side. Reads the text the
// way parseBNF does, so rdpRuleSpans(text)[i] is g.rules[i].
function rdpRuleSpans(text) {
  const spans = [];
  let at = 0;
  for (const raw of text.split("\n")) {
    const lineStart = at;
    at += raw.length + 1;
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const from = lineStart + raw.indexOf(line);
    const arrow = line.includes("->") ? "->" : "\u2192";
    const cut = line.indexOf(arrow);
    const lhsText = line.slice(0, cut).trimEnd();
    let pos = cut + arrow.length;
    const base = from + pos;
    for (const alt of bnfAlternatives(line.slice(pos))) {
      spans.push({ lhs: [from, from + lhsText.length], rhs: [base + alt.from, base + alt.to], toks: alt.toks.map((t) => [base + t.from, base + t.to]) });
    }
  }
  return spans;
}

// The pieces of a line key: { nt, part: head | memo | end | alt | sym, alt, k }, or null.
function rdpKeyParts(key) {
  const m = /^(.*)\u0001([heam])?(?:s(\d+)\.(\d+))?(\d+)?$/.exec(key || "");
  if (!m) return null;
  if (m[2] === "h") return { nt: m[1], part: "head" };
  if (m[2] === "m") return { nt: m[1], part: "memo" };
  if (m[2] === "e") return { nt: m[1], part: "end" };
  if (m[2] === "a") return { nt: m[1], part: "alt", alt: +m[5] };
  if (m[3] !== undefined) return { nt: m[1], part: "sym", alt: +m[3], k: +m[4] };
  return null;
}

// The parts of the grammar text that a line of the procedures stands for: [{ from, to, role }],
// role lhs | rhs | sym, and the production (rule, an index into g.rules) and for a symbol its place k. A procedure's own lines (head, end) stand for all rules of that nonterminal's
// left side; an alternative's lines for its production; a symbol's line also for that symbol.
function rdpGrammarRanges(g, spans, key) {
  const kp = rdpKeyParts(key);
  if (!kp || !g.alts[kp.nt]) return [];
  const out = [];
  const addRule = (ruleIdx) => {
    const sp = spans[ruleIdx];
    if (!sp) return;
    out.push({ from: sp.lhs[0], to: sp.lhs[1], role: "lhs", rule: ruleIdx });
    if (sp.rhs[1] > sp.rhs[0]) out.push({ from: sp.rhs[0], to: sp.rhs[1], role: "rhs", rule: ruleIdx });
  };
  if (kp.part === "head" || kp.part === "memo" || kp.part === "end") {
    for (const alt of g.alts[kp.nt]) if (spans[alt.rule]) out.push({ from: spans[alt.rule].lhs[0], to: spans[alt.rule].lhs[1], role: "lhs", rule: alt.rule });
  } else if (kp.part === "alt") {
    addRule(g.alts[kp.nt][kp.alt].rule);
  } else {
    const alt = g.alts[kp.nt][kp.alt];
    addRule(alt.rule);
    const tok = spans[alt.rule] && spans[alt.rule].toks[kp.k];
    if (tok && kp.k < alt.rhs.length) out.push({ from: tok[0], to: tok[1], role: "sym", rule: alt.rule, k: kp.k });
  }
  return out;
}

// How far a call has got, for the frame that a line key belongs to (ordered choice, where what is
// matched is settled): the symbols of its alternative before the one at the line, and the earlier
// alternatives, which have been given up. Returns { doneSyms: [[alt, k]], goneAlts: [alt] }.
function rdpFrameProgress(g, key, mode) {
  const kp = rdpKeyParts(key);
  const out = { doneSyms: [], goneAlts: [] };
  if (!kp || !g.alts[kp.nt] || kp.part === "head" || kp.part === "memo") return out;
  const never = mode === "predictive"; // the alternatives before the chosen one were never tried: none is given up
  if (kp.part === "end") { // every alternative has been given up
    if (!never) for (let a = 0; a < g.alts[kp.nt].length; a++) out.goneAlts.push(a);
    return out;
  }
  if (!never) for (let a = 0; a < kp.alt; a++) out.goneAlts.push(a);
  if (kp.part === "sym") for (let k = 0; k < kp.k; k++) out.doneSyms.push([kp.alt, k]);
  return out;
}

// The same as ranges in the grammar text: [{ from, to, role: "done" | "gone" }].
function rdpFrameRanges(g, spans, key, mode) {
  const kp = rdpKeyParts(key);
  const pr = rdpFrameProgress(g, key, mode);
  const out = [];
  if (!kp || !g.alts[kp.nt]) return out;
  for (const [a, k] of pr.doneSyms) {
    const tok = spans[g.alts[kp.nt][a].rule] && spans[g.alts[kp.nt][a].rule].toks[k];
    if (tok) out.push({ from: tok[0], to: tok[1], role: "done", rule: g.alts[kp.nt][a].rule, k });
  }
  for (const a of pr.goneAlts) {
    const sp = spans[g.alts[kp.nt][a].rule];
    if (sp && sp.rhs[1] > sp.rhs[0]) out.push({ from: sp.rhs[0], to: sp.rhs[1], role: "gone", rule: g.alts[kp.nt][a].rule });
  }
  return out;
}

// And as keys of the lines in the procedures: { done: [key], gone: [key] }.
function rdpFrameLines(g, key, mode) {
  const kp = rdpKeyParts(key);
  const pr = rdpFrameProgress(g, key, mode);
  const out = { done: [], gone: [] };
  if (!kp || !g.alts[kp.nt]) return out;
  for (const [a, k] of pr.doneSyms) out.done.push(rdpKey(kp.nt, "sym", a, k));
  for (const a of pr.goneAlts) {
    out.gone.push(rdpKey(kp.nt, "alt", a));
    for (let k = 0; k <= g.alts[kp.nt][a].rhs.length; k++) out.gone.push(rdpKey(kp.nt, "sym", a, k));
  }
  return out;
}

// The procedures of the predictive parser: no loops, no ✗; the next token chooses the alternative.
function rdpPredictiveProcedures(g) {
  const { sets } = rdpPredict(g);
  const shown = (set) => [...set].sort().map((t) => (t === "$" ? "⊣" : t)).join(", ");
  const symSeg = (s) => [g.nonterminals.has(s) ? "nt" : "t", s];
  const procs = [];
  for (const nt of g.order) {
    const alts = g.alts[nt];
    const multi = alts.length > 1;
    const lines = [];
    const add = (key, indent, kind, note, segs) => lines.push({ key, indent, kind, note, segs });
    add(rdpKey(nt, "head"), 0, "head", "Procedure " + nt + "(): the next token decides which alternative to use, so nothing is tried and undone.", [["nt", nt], ["", "()  "], ["cm", "▷ the next token chooses the alternative"]]);
    alts.forEach((alt, a) => {
      const base = multi ? 2 : 1;
      if (multi) {
        add(rdpKey(nt, "alt", a), 1, "alt", "Alternative " + (a + 1) + " of " + nt + ": " + nt + " → " + (alt.rhs.join(" ") || "ε") + ". It is used when the next token is one of {" + shown(sets[nt][a]) + "}" + (alt.rhs.length ? ": the tokens it can start with" : ": the tokens that can follow " + nt) + ".", [
          ["kw", "if"], ["", " next ∈ {" + shown(sets[nt][a]) + "}  "], ["nt", nt], ["", " → "],
          ...(alt.rhs.length ? alt.rhs.flatMap((s, x) => (x ? [["", " "], symSeg(s)] : [symSeg(s)])) : [["cm", "ε"]]),
        ]);
      }
      alt.rhs.forEach((s, k) => {
        const isNt = g.nonterminals.has(s);
        add(rdpKey(nt, "sym", a, k), base, "sym",
          isNt ? s + " is a nonterminal: call its procedure. If the next token cannot start it, that is a syntax error and the parse stops."
            : "“" + s + "” is a terminal: it must be the next token. If it is not, that is a syntax error and the parse stops.",
          isNt ? [["nt", s], ["", "()"]] : [["kw", "match"], ["", "("], ["t", s], ["", ")"]]);
      });
      add(rdpKey(nt, "sym", a, alt.rhs.length), base, "yield", (alt.rhs.length ? "Every symbol matched. " : "The alternative is empty: it matches without reading anything. ") + "Return; the choice is final.", [["kw", "return"]]);
    });
    if (multi) add(rdpKey(nt, "end"), 1, "end", "No alternative is predicted by the next token: syntax error.", [["kw", "else"], ["", "  "], ["kw", "error"], ["", "(“" + nt + "”)"]]);
    procs.push({ nt, lines });
  }
  return procs;
}

// ── The run ──────────────────────────────────────────────────────────

function rdpRun(g, tokens, opts) {
  const o = opts || {};
  const mode = o.mode === "predictive" ? "predictive" : o.mode === "ordered" || o.mode === "packrat" ? "ordered" : "full";
  const memoOn = o.mode === "packrat";
  const memo = new Map(); // "nt<i" -> end position, or -1 for a failure
  const maxEvents = o.maxEvents || RDP_MAX_EVENTS;
  const maxDepth = o.maxDepth || RDP_MAX_DEPTH;
  const n = tokens.length;
  const nodes = [];
  const events = [];
  const stack = []; // the calls that have not returned yet: { nt, i, id }
  let pending = []; // yields whose rest-of-parse failed, reported together before the next event

  const mk = (rec) => { rec.id = nodes.length; nodes.push(rec); return rec; };
  const tokText = (i) => (i < n ? "“" + tokens[i] + "”" : "the end of the input");
  const rhsText = (alt) => (alt.rhs.length ? alt.rhs.join(" ") : "ε");
  const span = (i, j) => (j === i ? "nothing" : j === i + 1 ? "token " + (i + 1) : "tokens " + (i + 1) + "–" + j);

  function flush() {
    if (!pending.length) return;
    const chain = pending;
    pending = [];
    const inner = chain[chain.length - 1];
    events.push({
      kind: "reject", node: inner.node.id, pos: inner.node.i, depth: stack.length,
      line: rdpKey(inner.node.nt, "sym", inner.alt, g.alts[inner.node.nt][inner.alt].rhs.length),
      kill: Math.min(...chain.map((c) => c.mark)),
      set: chain.flatMap((c) => [[c.node.id, "open"]].concat(c.altNode ? [[c.altNode.id, "open"]] : [])),
      text: "Backtrack: " + inner.node.nt + " had matched " + span(inner.node.i, inner.end) + ", but the rest of the parse failed. " +
        "Everything after it is undone and " + inner.node.nt + " looks for another way.",
    });
  }
  function emit(ev) {
    flush();
    if (events.length >= maxEvents - 1) throw { abort: "limit" };
    ev.depth = stack.length;
    events.push(ev);
    return ev;
  }

  // A call of nt at position i: the node, its event, and the left-recursion / depth checks.
  function enter(nt, i, parentId, site) {
    const node = mk({ kind: "call", parent: parentId, nt, i, site });
    if (stack.some((f) => f.nt === nt && f.i === i)) {
      emit({ kind: "loop", node: node.id, pos: i, line: site, add: [node.id], set: [[node.id, "fail"]],
        text: nt + " is called again at position " + i + " without having read anything: left recursion. It would call itself forever, so the run stops here." });
      throw { abort: "left-recursion", nt };
    }
    if (stack.length >= maxDepth) throw { abort: "limit" };
    stack.push({ nt, i, id: node.id });
    emit({ kind: "call", node: node.id, pos: i, line: rdpKey(nt, "head"), add: [node.id],
      text: "Call " + nt + " at position " + i + ", next token: " + tokText(i) + "." });
    return node;
  }
  function tryAlt(node, a, prev) {
    const alt = g.alts[node.nt][a];
    const altNode = mk({ kind: "alt", parent: node.id, nt: node.nt, alt: a, rule: alt.rule, i: node.i });
    emit({ kind: "try", node: node.id, altIdx: a, pos: node.i, line: rdpKey(node.nt, "alt", a), add: [altNode.id], kill: prev ? prev.id : null,
      text: node.nt + ": try alternative " + (a + 1) + ", " + node.nt + " → " + rhsText(alt) + (prev ? " (the previous one is undone)" : "") + "." });
    return altNode;
  }
  // The terminal at symbol k of alternative a; false on a mismatch.
  function matchTok(nt, a, k, sym, i, ownerId) {
    const site = rdpKey(nt, "sym", a, k);
    const t = mk({ kind: "tok", parent: ownerId, sym, i, site });
    if (tokens[i] === sym) {
      emit({ kind: "match", node: t.id, pos: i + 1, line: site, add: [t.id], set: [[t.id, "ok", i + 1]],
        text: "Match “" + sym + "” against token " + (i + 1) + "." });
      return true;
    }
    emit({ kind: "mismatch", node: t.id, pos: i, line: site, add: [t.id], set: [[t.id, "fail"]],
      text: "Expected “" + sym + "” but found " + tokText(i) + ": this alternative fails." });
    return false;
  }
  function yieldEv(node, a, j, altNode, ownerId) {
    const alt = g.alts[node.nt][a];
    const ev = { kind: "yield", node: node.id, pos: j, line: rdpKey(node.nt, "sym", a, alt.rhs.length), add: [], set: [[node.id, "ok", j]],
      text: node.nt + " matches " + span(node.i, j) + (mode === "ordered" ? " and commits to it: this choice is not revisited." : mode === "predictive" ? " and returns." : ".") };
    if (altNode) ev.set.push([altNode.id, "ok", j]);
    if (!alt.rhs.length) {
      const leaf = mk({ kind: "tok", parent: ownerId, sym: EPSILON, i: node.i, site: rdpKey(node.nt, "sym", a, 0), eps: true });
      ev.add.push(leaf.id);
      ev.set.push([leaf.id, "ok", node.i]);
    }
    return emit(ev);
  }
  function failEv(node) {
    return emit({ kind: "fail", node: node.id, pos: node.i, line: rdpKey(node.nt, "end"), kill: node.id + 1, set: [[node.id, "fail"]],
      text: node.nt + " has no alternative left: it fails at position " + node.i + "." });
  }

  // Complete search: the rest of the parse is passed in as k and tried for every way to match.
  function callFull(nt, i, parentId, site, k) {
    const node = enter(nt, i, parentId, site);
    const frame = stack[stack.length - 1];
    const alts = g.alts[nt];
    let prev = null;
    for (let a = 0; a < alts.length; a++) {
      const altNode = alts.length > 1 ? tryAlt(node, a, prev) : null;
      const owner = altNode ? altNode.id : node.id;
      const done = (j) => {
        yieldEv(node, a, j, altNode, owner);
        const mark = nodes.length;
        stack.pop();
        const res = k(j);
        if (!res) { stack.push(frame); pending.push({ node, altNode, alt: a, mark, end: j }); }
        return res;
      };
      if (seqFull(nt, a, 0, i, owner, done)) return true;
      prev = altNode;
    }
    failEv(node);
    stack.pop();
    return false;
  }
  function seqFull(nt, a, idx, i, owner, done) {
    const rhs = g.alts[nt][a].rhs;
    if (idx === rhs.length) return done(i);
    const sym = rhs[idx];
    if (g.nonterminals.has(sym)) {
      return callFull(sym, i, owner, rdpKey(nt, "sym", a, idx), (j) => seqFull(nt, a, idx + 1, j, owner, done));
    }
    if (!matchTok(nt, a, idx, sym, i, owner)) return false;
    return seqFull(nt, a, idx + 1, i + 1, owner, done);
  }

  // Ordered choice: returns the end position, or -1.
  function callOrdered(nt, i, parentId, site) {
    const memoKey = nt + "\u0002" + i;
    if (memoOn && memo.has(memoKey)) {
      const j = memo.get(memoKey);
      const hit = mk({ kind: "call", parent: parentId, nt, i, site, memo: true });
      emit({ kind: "memo", node: hit.id, pos: j >= 0 ? j : i, line: rdpKey(nt, "memo"), add: [hit.id], set: [[hit.id, j >= 0 ? "ok" : "fail", j >= 0 ? j : undefined]],
        text: nt + " at position " + i + " has been tried before: " + (j >= 0 ? "it matched " + span(i, j) : "it failed") + ". The remembered result is used and nothing is parsed again." });
      return j;
    }
    const node = enter(nt, i, parentId, site);
    const alts = g.alts[nt];
    let prev = null;
    for (let a = 0; a < alts.length; a++) {
      const altNode = alts.length > 1 ? tryAlt(node, a, prev) : null;
      const owner = altNode ? altNode.id : node.id;
      const rhs = alts[a].rhs;
      let p = i;
      let ok = true;
      for (let k = 0; k < rhs.length && ok; k++) {
        if (g.nonterminals.has(rhs[k])) {
          const j = callOrdered(rhs[k], p, owner, rdpKey(nt, "sym", a, k));
          if (j < 0) ok = false; else p = j;
        } else if (matchTok(nt, a, k, rhs[k], p, owner)) p++;
        else ok = false;
      }
      if (ok) {
        yieldEv(node, a, p, altNode, owner);
        stack.pop();
        if (memoOn) memo.set(memoKey, p);
        return p;
      }
      prev = altNode;
    }
    failEv(node);
    stack.pop();
    if (memoOn) memo.set(memoKey, -1);
    return -1;
  }

  // Without backtracking: the next token chooses the alternative; a mismatch ends the run.
  const pred = mode === "predictive" ? rdpPredict(g) : null;
  const pframes = []; // the calls and chosen alternatives that are still open
  function failPred(ev) {
    ev.set = (ev.set || []).concat(pframes.flatMap((f) => [[f.node.id, "fail"]].concat(f.altNode ? [[f.altNode.id, "fail"]] : [])));
    emit(ev);
    throw { abort: "syntax-error" };
  }
  function callPred(nt, i, parentId, site) {
    const node = enter(nt, i, parentId, site);
    const alts = g.alts[nt];
    const frame = { node, altNode: null };
    pframes.push(frame);
    let a = 0;
    if (alts.length > 1) {
      const tok = i < n ? tokens[i] : "$";
      const cell = pred.table[nt][tok];
      if (cell === undefined) {
        failPred({ kind: "fail", node: node.id, pos: i, line: rdpKey(nt, "end"),
          text: "Syntax error: " + nt + " has no alternative that starts with " + tokText(i) + ". A parser without backtracking cannot go back, so the parse stops here." });
      }
      const rules = Array.isArray(cell) ? cell : [cell];
      a = Math.min(...rules.map((r) => alts.findIndex((al) => al.rule === r)));
      const alt = alts[a];
      const altNode = mk({ kind: "alt", parent: node.id, nt, alt: a, rule: alt.rule, i });
      frame.altNode = altNode;
      const why = alt.rhs.length ? "it is in FIRST(" + alt.rhs.join(" ") + ")" : "it can follow " + nt + " (FOLLOW), and the alternative is empty";
      emit({ kind: "choose", node: node.id, altIdx: a, pos: i, line: rdpKey(nt, "alt", a), add: [altNode.id],
        text: nt + ": the next token is " + tokText(i) + "; " + why + ", so alternative " + (a + 1) + ", " + nt + " → " + rhsText(alt) + (rules.length > 1 ? ". The grammar is not LL(1): this token also predicts another alternative. The first is used." : ". The choice is final.") });
    }
    const owner = frame.altNode ? frame.altNode.id : node.id;
    const rhs = alts[a].rhs;
    let p = i;
    for (let k = 0; k < rhs.length; k++) {
      if (g.nonterminals.has(rhs[k])) p = callPred(rhs[k], p, owner, rdpKey(nt, "sym", a, k));
      else {
        const site = rdpKey(nt, "sym", a, k);
        const t = mk({ kind: "tok", parent: owner, sym: rhs[k], i: p, site });
        if (tokens[p] === rhs[k]) {
          emit({ kind: "match", node: t.id, pos: p + 1, line: site, add: [t.id], set: [[t.id, "ok", p + 1]], text: "Match “" + rhs[k] + "” against token " + (p + 1) + "." });
          p++;
        } else {
          failPred({ kind: "mismatch", node: t.id, pos: p, line: site, add: [t.id], set: [[t.id, "fail"]],
            text: "Syntax error: expected “" + rhs[k] + "” but found " + tokText(p) + ". A parser without backtracking cannot go back, so the parse stops here." });
        }
      }
    }
    yieldEv(node, a, p, frame.altNode, owner);
    pframes.pop();
    stack.pop();
    return p;
  }

  let accepted = false;
  let aborted = null;
  const acceptEv = () => emit({ kind: "accept", node: 0, pos: n, line: null, text: g.start + " has matched all " + n + " token" + (n === 1 ? "" : "s") + ": the input is accepted." });
  const leftoverEv = (j) => emit({ kind: "leftover", node: 0, pos: j, line: null,
    text: g.start + " matched only " + span(0, j) + " and " + (n - j) + " token" + (n - j === 1 ? "" : "s") + " remain" + (n - j === 1 ? "s" : "") + ", so this does not count as a parse." });
  try {
    if (mode === "predictive") {
      const j = callPred(g.start, 0, -1, null);
      if (j === n) { acceptEv(); accepted = true; }
      else leftoverEv(j);
    } else if (mode === "full") {
      accepted = callFull(g.start, 0, -1, null, (j) => {
        if (j === n) { acceptEv(); return true; }
        leftoverEv(j);
        return false;
      });
    } else {
      const j = callOrdered(g.start, 0, -1, null);
      if (j === n) { acceptEv(); accepted = true; }
      else if (j >= 0) leftoverEv(j);
    }
    flush();
  } catch (e) {
    if (!e || !e.abort) throw e;
    aborted = e.abort;
    if (e.abort === "limit") {
      const last = events[events.length - 1];
      events.push({ kind: "limit", node: last ? last.node : 0, pos: last ? last.pos : 0, line: null, depth: stack.length,
        text: "Stopped after " + events.length + " steps (or a call depth of " + maxDepth + "): the search is too large to follow." });
    }
  }
  return { mode, memo: memoOn, tokens, nodes, events, accepted, aborted };
}

// ── State at a step ──────────────────────────────────────────────────

// Replays events 0..step: { status: [{ st, end? } | undefined per node id], pos, event, backtracks, calls, maxDepth }.
function rdpStateAt(trace, step) {
  const status = [];
  let backtracks = 0;
  let calls = 0;
  let memoHits = 0;
  let maxDepth = 0;
  let ev = null;
  const last = Math.min(step, trace.events.length - 1);
  for (let s = 0; s <= last; s++) {
    ev = trace.events[s];
    if (ev.kill !== undefined && ev.kill !== null) {
      for (let id = ev.kill; id < status.length; id++) if (status[id] && status[id].st !== "dead") status[id] = { st: "dead" };
    }
    for (const id of ev.add || []) status[id] = { st: "open" };
    for (const [id, st, end] of ev.set || []) status[id] = { st, end };
    if (ev.kind === "reject" || (ev.kind === "try" && ev.altIdx > 0)) backtracks++;
    if (ev.kind === "call") calls++;
    if (ev.kind === "memo") memoHits++;
    if (ev.depth > maxDepth) maxDepth = ev.depth;
  }
  return { status, pos: ev ? ev.pos : 0, event: ev, backtracks, calls, memoHits, maxDepth };
}

// Code-line keys of the calls that led to the node an event is about (the "call stack" in the code).
function rdpPendingLines(trace, ev) {
  const out = [];
  let id = ev ? ev.node : -1;
  while (id >= 0 && trace.nodes[id]) {
    const nd = trace.nodes[id];
    if (nd.kind === "call" && nd.site && !out.includes(nd.site)) out.push(nd.site);
    id = nd.parent;
  }
  return out;
}

// ── Explanation of one node ──────────────────────────────────────────

// { role, title, facts: [[label, html]], lines: [html] }; role is open | ok | fail | dead.
function rdpExplainNode(g, trace, state, id) {
  const nd = trace.nodes[id];
  const cur = state.status[id];
  if (!nd || !cur) return null;
  const role = cur.st;
  const sym = (s) => "<b>" + esc(s) + "</b>";
  const tokens = trace.tokens;
  const ordered = trace.mode === "ordered" || trace.mode === "predictive"; // the choice is final
  const predictive = trace.mode === "predictive";
  const kids = trace.nodes.filter((x) => x.parent === id && state.status[x.id]);
  const facts = [];
  const lines = [];
  let title;
  if (nd.kind === "tok") {
    title = nd.eps ? "ε" : "Terminal " + nd.sym;
    if (nd.eps) {
      lines.push("The empty alternative: it matches without reading anything.");
    } else if (role === "fail") {
      lines.push("Expected " + sym(nd.sym) + " at position " + nd.i + " but found " + (nd.i < tokens.length ? sym(tokens[nd.i]) : "<i>the end of the input</i>") + ".");
    } else {
      facts.push(["Token", "number " + (nd.i + 1) + ", " + sym(tokens[nd.i] === undefined ? nd.sym : tokens[nd.i])]);
      lines.push(role === "dead"
        ? "This match was undone when the parse containing it failed later; the token is read again by the next attempt."
        : "The next input token equals " + sym(nd.sym) + ", so it is read.");
    }
  } else if (nd.kind === "alt") {
    const alt = g.alts[nd.nt][nd.alt];
    title = nd.nt + " → " + (alt.rhs.join(" ") || "ε");
    facts.push(["Alternative", (nd.alt + 1) + " of " + g.alts[nd.nt].length + " for " + sym(nd.nt)]);
    lines.push(predictive ? (role === "fail" ? "This alternative was chosen by the next token and then hit a syntax error." : "Chosen by the next token. The choice is final: the parser never goes back to try another alternative.")
      : role === "dead" ? "This alternative was given up: it failed, or the parse that used it failed later."
      : role === "fail" ? "This alternative failed."
      : role === "ok" ? "Every symbol of this alternative matched."
      : "Being tried: its symbols are matched from left to right.");
  } else {
    const alts = g.alts[nd.nt];
    title = nd.nt + " at position " + nd.i;
    facts.push(["Input", '<span class="ui-explain__done">' + esc(tokens.slice(0, nd.i).join(" ")) + '</span><span class="ui-explain__cursor">▏</span>' + (nd.i < tokens.length ? esc(tokens.slice(nd.i).join(" ")) : "<i>end of input</i>")]);
    if (cur.end !== undefined && role === "ok") facts.push(["Matched", cur.end > nd.i ? esc(tokens.slice(nd.i, cur.end).join(" ")) : "<i>nothing (ε)</i>"]);
    const tried = kids.filter((x) => x.kind === "alt");
    if (alts.length > 1) {
      facts.push(["Alternatives", alts.map((alt, a) => {
        const k = tried.find((x) => x.alt === a);
        const s = k ? state.status[k.id].st : null;
        return (a + 1) + ". " + esc(alt.rhs.join(" ") || "ε") + " — " + (s === null ? "not tried" : { open: "being tried", ok: "matched", fail: "failed", dead: "given up" }[s]);
      }).join("<br>")]);
    }
    const why = {
      open: sym(nd.nt) + " is trying to match from position " + nd.i + ".",
      ok: sym(nd.nt) + " matched " + (cur.end === nd.i ? "nothing" : "up to position " + cur.end) + "." +
        (predictive ? " A parser without backtracking has already made its choices: if what follows is wrong, that is a syntax error." : ordered ? " With ordered choice this is final: if what follows fails, " + sym(nd.nt) + " is not asked for another way." : " If what follows fails, " + sym(nd.nt) + " is asked for another way."),
      fail: sym(nd.nt) + " has no alternative that matches from position " + nd.i + ".",
      dead: "Backtracking went back past this call, so it is tried again if another path reaches it.",
    }[role];
    lines.push(why);
    if (nd.memo) lines.push("This result was remembered from an earlier call at the same position, so nothing was parsed again.");
  }
  return { role, title, facts, lines };
}
