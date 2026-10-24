// The token rules of the scanner tool as the scanner editor sees them: an ordered list of rows, one per rule (the
// order is the priority on a tie). No DOM access. Edits (insert, remove, move, update) are those of grammar-model.js.
//
// model = { rows: [row] }
//   row = { kind: "rule", name, quoted, pattern, skip, enabled } | { kind: "comment", text }
// Text: `name pattern [-> skip]` per line; a disabled rule is the comment `// disabled: name pattern`.

const SM_RULE = /^\s*(?:'((?:[^']|'')+)'|"((?:[^"]|"")+)"|(\S+))\s+(.*\S)\s*$/;

function smNewRule(name = "", pattern = "") {
  return { kind: "rule", name, quoted: false, pattern, skip: false, enabled: true };
}

function smParseLine(line, ln) {
  const m = SM_RULE.exec(line);
  if (!m) throw new Error("Line " + ln + ": expected  name  pattern");
  const quoted = m[3] === undefined;
  const name = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2] !== undefined ? m[2].replace(/""/g, '"') : m[3];
  let pattern = m[4], skip = false;
  const sk = /\s+->\s*skip$/.exec(pattern);
  if (sk) { skip = true; pattern = pattern.slice(0, sk.index); }
  return { kind: "rule", name, quoted, pattern: pattern.trim(), skip, enabled: true };
}

function smParse(text) {
  const rows = [];
  text.split("\n").forEach((raw, k) => {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) return;
    const t = line.trim();
    if (t.startsWith("//")) {
      const body = t.slice(2).trim();
      const off = /^disabled:\s*(.*)$/.exec(body);
      if (off) { try { const r = smParseLine(off[1], k + 1); r.enabled = false; rows.push(r); return; } catch (e) { /* a comment */ } }
      rows.push({ kind: "comment", text: body });
      return;
    }
    rows.push(smParseLine(line, k + 1));
  });
  return { rows };
}

// The name as written: quoted when it was, or has to be.
function smNameText(r) {
  if (r.quoted || /[\s'"]/.test(r.name) || r.name === "") return "'" + r.name.replace(/'/g, "''") + "'";
  return r.name;
}
const smRuleText = (r) => smNameText(r) + " " + r.pattern + (r.skip ? " -> skip" : "");

function smToText(model) {
  return model.rows.map((r) => (r.kind === "comment" ? "// " + r.text : r.enabled ? smRuleText(r) : "// disabled: " + smRuleText(r))).join("\n");
}

// The rule numbers (0, 1, …) of the enabled rules, by row; null for the others. That is the scanner's rule index.
function smIndexes(model) {
  let n = 0;
  return model.rows.map((r) => (r.kind === "rule" && r.enabled ? n++ : null));
}
