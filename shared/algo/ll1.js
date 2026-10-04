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
        conflicts.push({ nt, sym, rules: merged });
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
//   { type: "expand", nt, ruleIdx, rule }   (first rule is used on a conflict)
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
  return { type: "expand", nt: top, ruleIdx, rule: g.rules[ruleIdx] };
}

// ── Explaining a conflict ─────────────────────────────────────────────
// Why table entry M[nt, sym] holds several productions, in plain terms, and what usually
// fixes it. conflict = { nt, sym, rules: [production numbers] } as returned by
// buildLL1Table. Returns { kind, text, hint, tool }; `tool` names a sibling tool that can
// help ("grammar-rewrite") or is null.
function ll1ExplainConflict(g, first, conflict) {
  const { nt, sym } = conflict;
  const rules = conflict.rules.map((i) => ({ i, rule: g.rules[i] }));
  const show = (r) => `${r.rule.lhs} → ${r.rule.rhs.length ? r.rule.rhs.join(" ") : EPSILON}`;
  const list = rules.map((r) => `${r.i} (${show(r)})`).join(" and ");

  const leftRec = rules.find((r) => r.rule.rhs[0] === nt);
  if (leftRec) {
    return {
      kind: "left-recursion",
      text: `${nt} is left recursive (production ${leftRec.i}): to predict ${nt} the parser would have to expand ${nt} again before reading any input, so with ${sym} next it cannot tell ${list} apart.`,
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
          text: `Productions ${rules[a].i} and ${rules[b].i} both begin with ${x}, so one symbol of lookahead (${sym}) cannot choose between ${list}.`,
          hint: "Left factoring helps: move the common beginning into one production and let a new nonterminal carry the differing endings.",
          tool: null,
        };
      }
    }
  }
  const nullable = rules.find((r) => firstOfSeq(r.rule.rhs, first).has(EPSILON));
  if (nullable) {
    return {
      kind: "nullable",
      text: `Production ${nullable.i} can derive ε, so the parser chooses it when ${sym} is in FOLLOW(${nt}); but ${sym} can also start the other alternative, so ${list} compete.`,
      hint: "FIRST and FOLLOW overlap here. The grammar needs rewriting (or it is ambiguous, which no LL(1) grammar can be).",
      tool: null,
    };
  }
  return {
    kind: "overlap",
    text: `The alternatives ${list} can all start with ${sym}, so one symbol of lookahead cannot choose between them.`,
    hint: "The grammar needs rewriting (or it is ambiguous, which no LL(1) grammar can be).",
    tool: null,
  };
}
