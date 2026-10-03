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
