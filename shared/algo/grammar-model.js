// The grammar as the parser sees it, for the grammar editor: a flat ordered list of productions, one per row. `|` is
// not part of the model: it is how adjacent productions with the same left side are written in text. No DOM access.
// Depends on grammar.js (bnfAlternatives, EPSILON).
//
// model = { arrow: "->" | "→", rows: [row] }
//   row  = { kind: "rule", lhs: [symbol], rhs: [{ sym, quoted }], eps: spelling of ε or null, enabled }
//        | { kind: "comment", text }
// A rule with an empty rhs and a spelling of ε derives ε. An empty rule without one is a draft, a production being typed:
// it is not written to the text and has no number. A disabled rule is written as a comment in the text.

const GM_EPS = ["eps", "epsilon", EPSILON];

function gmNewRule(lhs, rhs = []) {
  return { kind: "rule", lhs: Array.isArray(lhs) ? lhs : [lhs], rhs: rhs.map((s) => (typeof s === "string" ? { sym: s, quoted: false } : s)), eps: null, enabled: true };
}

// The text of a grammar → the model. Lines are  lhs -> alternatives  (alternatives separated by |); a line starting
// with | continues the previous left side; // starts a comment, and a comment that is exactly one rule is a disabled
// rule. Throws on a line that is neither.
function gmParse(text) {
  const model = { arrow: null, rows: [] };
  let lastLhs = null;
  const addRule = (lhsToks, rhsText, enabled) => {
    for (const alt of bnfAlternatives(rhsText)) {
      const toks = alt.toks;
      const r = gmNewRule(lhsToks);
      r.enabled = enabled;
      const solo = toks.length === 1 ? toks[0] : null;
      if (!toks.length) r.eps = EPSILON;
      else if (solo && ((!solo.quoted && GM_EPS.includes(solo.sym)) || (solo.quoted && solo.sym === ""))) r.eps = solo.quoted ? "''" : solo.sym;
      else r.rhs = toks.map((t) => ({ sym: t.sym, quoted: t.quoted }));
      model.rows.push(r);
    }
  };
  const arrowOf = (line) => (line.includes("->") ? "->" : line.includes("→") ? "→" : null);
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("//")) {
      const body = line.slice(2).trim();
      const arrow = arrowOf(body);
      const at = arrow ? body.indexOf(arrow) : -1;
      const lhs = at > 0 ? body.slice(0, at).trim() : "";
      if (arrow && lhs && !/[|'"]/.test(lhs) && !/^\/\//.test(body)) {
        if (!model.arrow) model.arrow = arrow;
        addRule(lhs.split(/\s+/), body.slice(at + arrow.length), false);
      } else model.rows.push({ kind: "comment", text: body });
      continue;
    }
    if (line.startsWith("|")) {
      if (!lastLhs) throw new Error("A line cannot start with | before the first rule");
      addRule(lastLhs, line.slice(1), true);
      continue;
    }
    const arrow = arrowOf(line);
    if (!arrow) throw new Error("Missing '->' in: " + line);
    const at = line.indexOf(arrow);
    const lhs = line.slice(0, at).trim();
    if (!lhs) throw new Error("Missing left side in: " + line);
    if (!model.arrow) model.arrow = arrow;
    lastLhs = lhs.split(/\s+/);
    addRule(lastLhs, line.slice(at + arrow.length), true);
  }
  if (!model.arrow) model.arrow = "->";
  return model;
}

// One symbol as text: quoted when it was quoted, or has to be (spaces, |, a quote at the start, a spelling of ε).
function gmSymText(s) {
  const needs = s.quoted || s.sym === "" || /[\s|]/.test(s.sym) || /^['"]/.test(s.sym) || GM_EPS.includes(s.sym);
  if (!needs) return s.sym;
  const q = s.sym.includes("'") && !s.sym.includes('"') ? '"' : "'";
  return q + s.sym.split(q).join(q + q) + q;
}

const gmLhsKey = (r) => r.lhs.join(" ");
const gmIsDraft = (r) => r.kind === "rule" && !r.rhs.length && !r.eps;
// A rule that is part of the grammar: enabled and not a draft.
const gmLive = (r) => r.kind === "rule" && r.enabled && !gmIsDraft(r);
const gmRhsText = (r) => (r.rhs.length ? r.rhs.map(gmSymText).join(" ") : r.eps || EPSILON);

// The model → text: adjacent enabled rules with the same left side share a line, joined by |.
function gmToText(model) {
  const lines = [];
  let prev = null;
  for (const row of model.rows) {
    if (row.kind === "comment") { lines.push("// " + row.text); prev = null; continue; }
    if (gmIsDraft(row)) continue;
    if (!row.enabled) { lines.push("// " + gmLhsKey(row) + " " + model.arrow + " " + gmRhsText(row)); prev = null; continue; }
    if (prev && gmLhsKey(prev) === gmLhsKey(row)) lines[lines.length - 1] += " | " + gmRhsText(row);
    else lines.push(gmLhsKey(row) + " " + model.arrow + " " + gmRhsText(row));
    prev = row;
  }
  return lines.join("\n");
}

// The production numbers (1, 2, …) of the enabled rules, by row; null for comments and disabled rules.
function gmNumbers(model) {
  let n = 0;
  return model.rows.map((r) => (gmLive(r) ? ++n : null));
}

// Rows whose left side is shown faded: an enabled rule right after an enabled rule with the same left side.
function gmGhosts(model) {
  return model.rows.map((r, i) => {
    const p = model.rows[i - 1];
    return !!(r.kind === "rule" && r.enabled && p && p.kind === "rule" && p.enabled && gmLhsKey(p) === gmLhsKey(r));
  });
}

// The names that have a production (enabled rules): what makes a symbol a nonterminal.
function gmNonterminals(model) {
  const s = new Set();
  for (const r of model.rows) if (gmLive(r)) s.add(gmLhsKey(r));
  return s;
}

// ── Edits: each returns a new model ───────────────────────────────────

const gmClone = (model) => JSON.parse(JSON.stringify(model));

function gmInsert(model, index, row) {
  const m = gmClone(model);
  m.rows.splice(index, 0, row);
  return m;
}
function gmRemove(model, index) {
  const m = gmClone(model);
  m.rows.splice(index, 1);
  return m;
}
function gmMove(model, index, delta) {
  const j = index + delta;
  if (j < 0 || j >= model.rows.length) return model;
  const m = gmClone(model);
  const [r] = m.rows.splice(index, 1);
  m.rows.splice(j, 0, r);
  return m;
}
function gmUpdate(model, index, changes) {
  const m = gmClone(model);
  Object.assign(m.rows[index], changes);
  return m;
}
// The start symbol is the left side of the first rule: move all rules of a left side to the top (in their order).
function gmMakeStart(model, lhsKey) {
  const m = gmClone(model);
  const mine = m.rows.filter((r) => r.kind === "rule" && gmLhsKey(r) === lhsKey);
  const rest = m.rows.filter((r) => !(r.kind === "rule" && gmLhsKey(r) === lhsKey));
  m.rows = mine.concat(rest);
  return m;
}
