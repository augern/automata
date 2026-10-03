// Pure helpers for manual derivations over unrestricted (Type 0/1/2/3)
// grammars. No DOM access.
//
// Grammar: { rules: [{ lhs: string[], rhs: string[] }], nonterminals: Set, start }
// A sentential form is a string[]; an empty rhs is ε.

// Extended beyond parseBNF: the LHS can be a sequence of symbols.
// Nonterminals = (a) tokens that are a complete single-symbol LHS, plus
//                (b) uppercase-initial tokens in multi-symbol LHSs.
function parseDerivationGrammar(text) {
  const EPS_TOKENS = new Set(["eps", "epsilon", "ε", "''", '""']);
  const lines = text.split("\n").map(l => l.trim())
                    .filter(l => l && !l.startsWith("//"));
  if (!lines.length) throw new Error("Empty grammar");

  const rules = [];
  for (const line of lines) {
    const arrow = line.includes("->") ? "->" : line.includes("→") ? "→" : null;
    if (!arrow) throw new Error("Missing → in: " + line);
    const arrowIdx = line.indexOf(arrow);
    const lhsStr   = line.slice(0, arrowIdx).trim();
    const rhsStr   = line.slice(arrowIdx + arrow.length).trim();
    const lhsToks  = lhsStr.split(/\s+/).filter(Boolean);
    if (!lhsToks.length) throw new Error("Empty LHS in: " + line);
    for (const alt of rhsStr.split("|")) {
      const rhsToks = alt.trim().split(/\s+/).filter(Boolean);
      rules.push({
        lhs: lhsToks,
        rhs: rhsToks.length === 1 && EPS_TOKENS.has(rhsToks[0]) ? [] : rhsToks,
      });
    }
  }
  if (!rules.length) throw new Error("No rules found");

  // Nonterminals: (a) symbols appearing as complete single-token LHS
  const singleLHSnts = new Set(rules.filter(r => r.lhs.length === 1).map(r => r.lhs[0]));
  // (b) uppercase-starting tokens in multi-symbol LHS (context-sensitive convention)
  const multiLHSnts  = new Set(
    rules.flatMap(r => r.lhs.length > 1 ? r.lhs.filter(s => /^[A-Z]/.test(s)) : [])
  );
  const nonterminals = new Set([...singleLHSnts, ...multiLHSnts]);

  // Start symbol: LHS of the first single-token rule
  const startRule = rules.find(r => r.lhs.length === 1);
  if (!startRule) throw new Error("No single-symbol LHS found — need at least one rule of the form A -> …");
  const start = startRule.lhs[0];

  return { rules, nonterminals, start };
}

// True if lhs exactly matches form[lo..hi] (inclusive).
function derivMatchesRange(form, lo, hi, lhs) {
  if (lhs.length !== hi - lo + 1) return false;
  return lhs.every((s, j) => form[lo + j] === s);
}

// The form obtained by replacing form[lo..hi] with rule.rhs.
function derivApply(form, lo, hi, rule) {
  return [...form.slice(0, lo), ...rule.rhs, ...form.slice(hi + 1)];
}

// The derivation is complete when no rule's LHS occurs anywhere in the form.
function derivIsDone(grammar, form) {
  for (const rule of grammar.rules) {
    const lhs = rule.lhs;
    if (lhs.length > form.length) continue;
    for (let i = 0; i <= form.length - lhs.length; i++) {
      if (lhs.every((s, j) => form[i + j] === s)) return false;
    }
  }
  return true;
}
