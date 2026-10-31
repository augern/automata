// Pure LL(1) algorithms: predictive table construction and one step of the
// table-driven parser. No DOM access. Depends on grammar.js (EPSILON, firstOfSeq).

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LL(1) TABLE CONSTRUCTION  (LL-specific)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Returns { table, conflicts }
// table[NT][terminal] = ruleIndex  (or array if conflict)
function buildLL1Table(g, first, follow) {
  const { rules, nonterminals: nts, terminals: terms } = g;
  const table = {},
    conflicts = [];
  const conflictAt = new Map(); // "nt|sym" → its entry of conflicts

  for (const nt of nts) table[nt] = {};

  function add(nt, sym, ruleIdx) {
    const cur = table[nt][sym];
    if (cur === undefined) {
      table[nt][sym] = ruleIdx;
    } else if (cur !== ruleIdx) {
      const ex = Array.isArray(cur) ? cur : [cur];
      if (!ex.includes(ruleIdx)) {
        const merged = [...ex, ruleIdx];
        table[nt][sym] = merged;
        const k = nt + "\u0001" + sym;
        if (conflictAt.has(k)) conflictAt.get(k).rules = merged;
        else { const c = { nt, sym, rules: merged }; conflictAt.set(k, c); conflicts.push(c); }
      }
    }
  }

  // For each rule A -> alpha (index i):
  rules.forEach((rule, i) => {
    const { lhs, rhs } = rule;
    if (!nts.has(lhs)) return;
    const fa = firstOfSeq(rhs, first);
    // For each terminal in FIRST(alpha) \ {eps}: add to M[A][a]
    for (const a of fa) {
      if (a !== EPSILON) add(lhs, a, i);
    }
    // If eps in FIRST(alpha): for each b in FOLLOW(A): add to M[A][b]
    if (fa.has(EPSILON)) {
      for (const b of follow[lhs] || []) add(lhs, b, i);
    }
  });

  return { table, conflicts };
}

// One step of the predictive parser. `stack` has the top as its last element;
// `tokens[pos]` is the lookahead (the token list ends with "$").
// Returns one of:
//   { type: "accept" }
//   { type: "match", token }
//   { type: "expand", nt, ruleIdx, rule, conflict }   (first rule is used on a conflict, which lists all the rules of the cell)
//   { type: "error", reason: "mismatch", expected, got }
//   { type: "error", reason: "no-rule", nt, token }
function ll1Step(g, table, stack, tokens, pos) {
  const token = tokens[pos];
  const top = stack[stack.length - 1];
  if (top === "$" && token === "$") return { type: "accept" };
  if (!g.nonterminals.has(top)) {
    return top === token ? { type: "match", token } : { type: "error", reason: "mismatch", expected: top, got: token };
  }
  const entry = table[top] && table[top][token];
  if (entry === undefined) return { type: "error", reason: "no-rule", nt: top, token };
  const ruleIdx = Array.isArray(entry) ? entry[0] : entry;
  return { type: "expand", nt: top, ruleIdx, rule: g.rules[ruleIdx], conflict: Array.isArray(entry) ? [...entry] : null };
}

// ── Explaining a conflict ─────────────────────────────────────────────
// Why table entry M[nt, sym] holds several productions, in plain terms, and what may fix it. conflict = { nt, sym,
// rules: [rule indexes from 0] } as returned by buildLL1Table. The text numbers productions from 1, as the tables do.
// Returns { kind, text, hint, tool }; `tool` names a sibling tool that can help ("grammar-rewrite") or is null.
function ll1ExplainConflict(g, first, conflict) {
  const { nt, sym } = conflict;
  const rules = conflict.rules.map((i) => ({ n: i + 1, rule: g.rules[i] }));
  const show = (r) => `${r.rule.lhs} → ${r.rule.rhs.length ? r.rule.rhs.join(" ") : EPSILON}`;
  const list = rules.map((r) => `${r.n} (${show(r)})`).join(" and ");
  const nullableRules = rules.filter((r) => firstOfSeq(r.rule.rhs, first).has(EPSILON));

  const direct = rules.find((r) => r.rule.rhs[0] === nt);
  if (direct) {
    return {
      kind: "left-recursion",
      text: `${nt} is left recursive (production ${direct.n}): to predict ${nt} the parser would have to expand ${nt} again before reading any input, so with ${sym} next it cannot tell ${list} apart.`,
      hint: "Remove the left recursion first.",
      tool: "grammar-rewrite",
    };
  }
  if (ll1LeftRecursive(g, first).has(nt)) {
    return {
      kind: "left-recursion",
      text: `${nt} is left recursive through other nonterminals: expanding ${nt} can lead back to ${nt} before any input is read, so with ${sym} next the parser cannot tell ${list} apart.`,
      hint: "Remove the left recursion first.",
      tool: "grammar-rewrite",
    };
  }
  for (let a = 0; a < rules.length; a++) {
    for (let b = a + 1; b < rules.length; b++) {
      const x = rules[a].rule.rhs[0];
      if (x !== undefined && x === rules[b].rule.rhs[0]) {
        return {
          kind: "common-prefix",
          text: `Productions ${rules[a].n} and ${rules[b].n} both begin with ${x}, so one symbol of lookahead (${sym}) cannot choose between ${list}.`,
          hint: "Left factoring may resolve this: the common prefix moves into one production and a new nonterminal carries the differing endings. The new nonterminal can have a conflict of its own (the dangling else).",
          tool: null,
        };
      }
    }
  }
  if (nullableRules.length > 1) {
    return {
      kind: "nullable",
      text: `Productions ${nullableRules.map((r) => r.n).join(" and ")} can both derive ε, so ${sym} in FOLLOW(${nt}) selects either of ${list}.`,
      hint: "Two alternatives that derive ε cannot be told apart by one symbol: the grammar must be rewritten, and it may be ambiguous.",
      tool: null,
    };
  }
  if (nullableRules.length === 1) {
    return {
      kind: "nullable",
      text: `Production ${nullableRules[0].n} can derive ε, so the parser chooses it when ${sym} is in FOLLOW(${nt}); but ${sym} can also start the other alternative, so ${list} compete.`,
      hint: "FIRST and FOLLOW overlap. Rewriting may remove it; an ambiguous grammar, and some unambiguous ones, have no LL(1) form.",
      tool: null,
    };
  }
  return {
    kind: "overlap",
    text: `The alternatives ${list} can all start with ${sym}, so one symbol of lookahead cannot choose between them.`,
    hint: "Rewriting may remove it; an ambiguous grammar, and some unambiguous ones, have no LL(1) form.",
    tool: null,
  };
}

// The nonterminals that can derive themselves as the leftmost symbol, directly or through nullable prefixes.
function ll1LeftRecursive(g, first) {
  const nts = g.nonterminals;
  const next = {};
  for (const nt of nts) next[nt] = new Set();
  for (const r of g.rules) {
    for (const s of r.rhs) {
      if (nts.has(s)) next[r.lhs].add(s);
      if (!(nts.has(s) && first[s] && first[s].has(EPSILON))) break;
    }
  }
  const bad = new Set();
  for (const nt of nts) {
    const seen = new Set();
    const stack = [...next[nt]];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      for (const y of next[x]) stack.push(y);
    }
    if (seen.has(nt)) bad.add(nt);
  }
  return bad;
}

// The LL(1) condition, nonterminal by nonterminal: for A → α | β, FIRST(α) ∩ FIRST(β) = ∅, and when β derives ε,
// FIRST(α) ∩ FOLLOW(A) = ∅ (and at most one alternative derives ε). One entry per nonterminal with several
// alternatives: { nt, ok, issues: [{ kind: "first-first" | "first-follow" | "both-nullable", a, b, tokens }] }, a and b
// the productions (numbered from 1).
function ll1Check(g, first, follow) {
  const out = [];
  for (const nt of g.order || [...g.nonterminals]) {
    const alts = g.rules.map((r, i) => ({ r, n: i + 1 })).filter((x) => x.r.lhs === nt);
    if (alts.length < 2) continue;
    const f = alts.map((x) => firstOfSeq(x.r.rhs, first));
    const issues = [];
    for (let i = 0; i < alts.length; i++) {
      for (let j = i + 1; j < alts.length; j++) {
        const both = [...f[i]].filter((t) => t !== EPSILON && f[j].has(t));
        if (both.length) issues.push({ kind: "first-first", a: alts[i].n, b: alts[j].n, tokens: both.sort() });
        if (f[i].has(EPSILON) && f[j].has(EPSILON)) issues.push({ kind: "both-nullable", a: alts[i].n, b: alts[j].n, tokens: [] });
        for (const [x, y] of [[i, j], [j, i]]) {
          if (!f[y].has(EPSILON)) continue;
          const over = [...f[x]].filter((t) => t !== EPSILON && (follow[nt] || new Set()).has(t));
          if (over.length) issues.push({ kind: "first-follow", a: alts[x].n, b: alts[y].n, tokens: over.sort() });
        }
      }
    }
    out.push({ nt, ok: issues.length === 0, issues });
  }
  return out;
}

// Why each member of FIRST(A) and FOLLOW(A) is there: { first: { A: { token: sentence } }, follow: { A: { token: sentence } } }.
// A sentence names a production (numbered from 1) that puts the token there; the claim it makes is true, though the
// token may have several such reasons.
function ll1Why(g, first, follow) {
  const why = { first: {}, follow: {} };
  for (const nt of g.nonterminals) { why.first[nt] = {}; why.follow[nt] = {}; }
  const nullable = (s) => g.nonterminals.has(s) && first[s] && first[s].has(EPSILON);
  const prod = (i) => `${g.rules[i].lhs} → ${g.rules[i].rhs.length ? g.rules[i].rhs.join(" ") : EPSILON}`;
  g.rules.forEach((r, i) => {
    let allNullable = true;
    for (const y of r.rhs) {
      for (const t of first[y] || []) {
        if (t === EPSILON || why.first[r.lhs][t]) continue;
        why.first[r.lhs][t] = `${t} ∈ FIRST(${y}), and ${y} comes first in production ${i + 1} (${prod(i)})` + (y === r.rhs[0] ? "" : ", after symbols that can derive ε");
      }
      if (!nullable(y)) { allNullable = false; break; }
    }
    if (allNullable && !why.first[r.lhs][EPSILON]) why.first[r.lhs][EPSILON] = r.rhs.length ? `every symbol of production ${i + 1} (${prod(i)}) can derive ε` : `production ${i + 1} (${prod(i)}) is empty`;
  });
  if (why.follow[g.start]) why.follow[g.start]["$"] = `${g.start} is the start symbol: the end of the input can follow it`;
  g.rules.forEach((r, i) => {
    r.rhs.forEach((x, k) => {
      if (!g.nonterminals.has(x)) return;
      const rest = r.rhs.slice(k + 1);
      const fr = firstOfSeq(rest, first);
      for (const t of fr) {
        if (t === EPSILON || why.follow[x][t]) continue;
        why.follow[x][t] = `${t} can come right after ${x} in production ${i + 1} (${prod(i)}): ${t} ∈ FIRST(${rest.join(" ")})`;
      }
      if (fr.has(EPSILON)) {
        for (const t of follow[r.lhs] || []) {
          if (why.follow[x][t]) continue;
          why.follow[x][t] = `in production ${i + 1} (${prod(i)}) what follows ${x} ${rest.length ? "can derive ε" : "is nothing"}, so ${t} ∈ FOLLOW(${r.lhs}) also follows ${x}`;
        }
      }
    });
  });
  return why;
}
