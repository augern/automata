// Pure grammar algorithms: BNF parsing, FIRST and FOLLOW.
// No DOM access. Loaded as a classic script by the browser tools (must come
// before shared.js) and evaluated in a vm context by the tests in test/.

const EPSILON = "ε"; // ε — single source of truth for the epsilon sentinel

// HTML-escape a value for safe insertion into DOM content or attributes.
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:BNF-PARSER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// The alternatives of a right-hand side, with the offsets of everything (relative to the text):
//   [{ from, to, toks: [{ sym, from, to }] }]   an alternative with no tokens is ε.
// Symbols are separated by whitespace and alternatives by "|". A symbol in single or double quotes is a terminal
// written literally: '|' is the terminal |, 'a b' one terminal with a space in it, and '' (or "") is ε. Unquoted,
// eps, epsilon and ε are ε.
function bnfAlternatives(rhs) {
  const alts = [];
  let cur = { from: 0, to: 0, toks: [] };
  let i = 0;
  const close = (end) => { cur.to = end; alts.push(cur); };
  while (i < rhs.length) {
    const c = rhs[i];
    if (c === "|") { close(i); cur = { from: i + 1, to: i + 1, toks: [] }; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      const end = rhs.indexOf(c, i + 1);
      if (end < 0) throw new Error("Unterminated quote in: " + rhs.trim());
      cur.toks.push({ sym: rhs.slice(i + 1, end), quoted: true, from: i, to: end + 1 });
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < rhs.length && rhs[j] !== "|" && !/\s/.test(rhs[j])) j++;
    cur.toks.push({ sym: rhs.slice(i, j), quoted: false, from: i, to: j });
    i = j;
  }
  close(rhs.length);
  // trim each alternative to its tokens
  for (const a of alts) if (a.toks.length) { a.from = a.toks[0].from; a.to = a.toks[a.toks.length - 1].to; }
  return alts;
}
// The symbols of one alternative; [] for ε.
function bnfSymbols(alt, epsTokens = ["eps", "epsilon", EPSILON]) {
  const t = alt.toks;
  if (t.length === 1 && ((!t[0].quoted && epsTokens.includes(t[0].sym)) || (t[0].quoted && t[0].sym === ""))) return [];
  return t.filter((x) => !(x.quoted && x.sym === "")).map((x) => x.sym);
}

const BNF_ANGLE = /^<[^<>\s]+>$/;

function parseBNF(text, augment = true) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));
  if (!lines.length) throw new Error("Empty grammar");
  const rules = [];
  const angle = new Set(); // unquoted <names> on right-hand sides
  for (const line of lines) {
    const arrow = line.includes("->") ? "->" : line.includes("\u2192") ? "\u2192" : null;
    if (!arrow) throw new Error("Missing '->' in: " + line);
    // Split at the first arrow only; any later arrow is an ordinary RHS token.
    const at = line.indexOf(arrow);
    const lhs = line.slice(0, at).trim();
    const rhs = line.slice(at + arrow.length).trim();
    if (!lhs) throw new Error("Missing LHS in: " + line);
    for (const alt of bnfAlternatives(rhs)) {
      rules.push({ lhs, rhs: bnfSymbols(alt) });
      for (const t of alt.toks) if (!t.quoted && BNF_ANGLE.test(t.sym)) angle.add(t.sym);
    }
  }
  if (!rules.length) throw new Error("No rules found");
  // A name in angle brackets, <noun>, is a nonterminal by convention: it must have a rule.
  const defined = new Set(rules.map((r) => r.lhs));
  for (const a of angle) if (!defined.has(a)) throw new Error("No rule for " + a + " (a name in angle brackets is a nonterminal)");
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
