// Pure grammar algorithms: BNF parsing, FIRST and FOLLOW.
// No DOM access. Loaded as a classic script by the browser tools (must come
// before shared.js) and evaluated in a vm context by the tests in test/.

const EPSILON = "ε"; // ε — single source of truth for the epsilon sentinel

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:BNF-PARSER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function parseBNF(text, augment = true) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));
  if (!lines.length) throw new Error("Empty grammar");
  const rules = [];
  for (const line of lines) {
    const arrow = line.includes("->") ? "->" : line.includes("\u2192") ? "\u2192" : null;
    if (!arrow) throw new Error("Missing '->' in: " + line);
    const [lhs, rhs] = line.split(arrow).map((s) => s.trim());
    if (!lhs) throw new Error("Missing LHS in: " + line);
    for (const alt of rhs.split("|")) {
      const toks = alt.trim().split(/\s+/).filter(Boolean);
      rules.push({
        lhs,
        rhs: toks.length === 1 && ["eps", "epsilon", EPSILON, "''", `""`].includes(toks[0]) ? [] : toks,
      });
    }
  }
  if (!rules.length) throw new Error("No rules found");
  const origStart = rules[0].lhs;
  if (augment) {
    const existingLHS = new Set(rules.map((r) => r.lhs));
    let aug = origStart + "'";
    while (existingLHS.has(aug)) aug += "'";
    rules.unshift({ lhs: aug, rhs: [origStart] });
  }
  const start = rules[0].lhs;
  const nts = new Set(rules.map((r) => r.lhs)),
    terms = new Set();
  for (const r of rules) for (const s of r.rhs) if (!nts.has(s)) terms.add(s);
  terms.add("$");
  return { rules, start, augmented: augment, nonterminals: nts, terminals: terms };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:FIRST-FOLLOW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function firstOfSeq(seq, first) {
  const r = new Set();
  for (const sym of seq) {
    const fs = first[sym] || new Set([sym]);
    for (const s of fs) if (s !== EPSILON) r.add(s);
    if (!fs.has(EPSILON)) return r;
  }
  r.add(EPSILON);
  return r;
}

function computeFirst(g) {
  const { rules, nonterminals: nts, terminals: terms } = g,
    first = {};
  for (const nt of nts) first[nt] = new Set();
  for (const t of terms) first[t] = new Set([t]);
  let ch = true;
  while (ch) {
    ch = false;
    for (const { lhs, rhs } of rules)
      for (const s of firstOfSeq(rhs, first))
        if (!first[lhs].has(s)) {
          first[lhs].add(s);
          ch = true;
        }
  }
  return first;
}

function computeFollow(g, first) {
  const { rules, nonterminals: nts, start } = g,
    follow = {};
  for (const nt of nts) follow[nt] = new Set();
  follow[start].add("$");
  let ch = true;
  while (ch) {
    ch = false;
    for (const { lhs, rhs } of rules)
      for (let i = 0; i < rhs.length; i++) {
        const sym = rhs[i];
        if (!nts.has(sym)) continue;
        const fb = firstOfSeq(rhs.slice(i + 1), first);
        for (const s of fb)
          if (s !== EPSILON && !follow[sym].has(s)) {
            follow[sym].add(s);
            ch = true;
          }
        if (fb.has(EPSILON))
          for (const s of follow[lhs])
            if (!follow[sym].has(s)) {
              follow[sym].add(s);
              ch = true;
            }
      }
  }
  return follow;
}
