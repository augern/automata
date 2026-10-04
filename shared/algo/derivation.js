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

// ── Random derivation ─────────────────────────────────────────────────
// A random step is a pure function of (seed, step number, current form): no hidden
// generator state, so going Back and then forward again replays the same choice,
// and the same seed always yields the same derivation.

// Every (rule, position) at which a rule's LHS occurs in the form: [{ ruleIdx, lo, hi }].
function derivMoves(grammar, form) {
  const moves = [];
  grammar.rules.forEach((rule, ruleIdx) => {
    const n = rule.lhs.length;
    for (let lo = 0; lo + n <= form.length; lo++) {
      if (derivMatchesRange(form, lo, lo + n - 1, rule.lhs)) moves.push({ ruleIdx, lo, hi: lo + n - 1 });
    }
  });
  return moves;
}

// 32-bit mix of a seed and a step number (a murmur-style finaliser).
function derivHash(seed, index) {
  let h = (seed >>> 0) ^ Math.imul(index + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// Uniform in [0, 1) from a 32-bit state (mulberry32, first output).
function derivUnit(state) {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// The randomly chosen next move at step `index`, or null when no rule applies.
function derivRandomMove(grammar, form, seed, index) {
  const moves = derivMoves(grammar, form);
  if (!moves.length) return null;
  return moves[Math.floor(derivUnit(derivHash(seed, index)) * moves.length)];
}

// How a derivation ended: "terminal" (only terminals left: a word of the language),
// "stuck" (no rule applies but nonterminals remain: a dead end, possible in
// context-sensitive grammars), or null while a rule still applies.
function derivOutcome(grammar, form) {
  if (derivMoves(grammar, form).length) return null;
  return form.some((s) => grammar.nonterminals.has(s)) ? "stuck" : "terminal";
}
