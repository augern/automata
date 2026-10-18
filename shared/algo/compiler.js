// Pure engine of the compiler-construction tools: a scanner (token rules → longest-match scanning), a small
// action language for syntax-directed translation, and a parse run in which the LR parser pulls tokens from the
// scanner and runs the actions of the reduced rules. The run is a list of frames (one per event) that a view
// replays. No DOM access. Depends on grammar.js (EPSILON, computeFirst/Follow), regex.js (regexToNFA) and lr.js.

// ── Token rules ──────────────────────────────────────────────────────

// Rules, one per line: `name  pattern  [-> skip]`. The name is the terminal the grammar uses (quoted when it has
// special characters: '+'); the pattern is a regular expression in the syntax of the Regular Expression tool, with
// character classes [a-z0-9] added. Earlier rules win ties. `-> skip` rules (white space, comments) produce no token.
function cmpParseTokenRules(text) {
  const rules = [];
  text.split("\n").forEach((raw, ln) => {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("//")) return;
    const m = /^\s*(?:'((?:[^']|'')+)'|"((?:[^"]|"")+)"|(\S+))\s+(.*\S)\s*$/.exec(line);
    if (!m) throw new Error("Line " + (ln + 1) + ": expected  name  pattern");
    const name = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2] !== undefined ? m[2].replace(/""/g, '"') : m[3];
    let pattern = m[4], skip = false;
    const sk = /\s+->\s*skip$/.exec(pattern);
    if (sk) { skip = true; pattern = pattern.slice(0, sk.index); }
    rules.push({ name, pattern: pattern.trim(), skip });
  });
  if (!rules.length) throw new Error("No token rules");
  return rules;
}

const cmpEscapeLit = (ch) => (/[|*+?().\\]/.test(ch) ? "\\" + ch : ch);

// Character classes [a-z_] become unions; \t and \n are the characters; other escapes are kept for regexToNFA.
function cmpExpandPattern(p) {
  let out = "", i = 0;
  const esc = (c) => (c === "t" ? "\t" : c === "n" ? "\n" : c);
  while (i < p.length) {
    const c = p[i];
    if (c === "\\") {
      if (i + 1 >= p.length) throw new Error("Trailing \\ in " + p);
      const n = p[i + 1];
      out += n === "t" || n === "n" ? esc(n) : "\\" + n;
      i += 2;
    } else if (c === "[") {
      const members = [];
      let j = i + 1;
      while (j < p.length && p[j] !== "]") {
        let ch = p[j];
        if (ch === "\\") { ch = esc(p[j + 1]); j += 2; } else j++;
        if (p[j] === "-" && j + 1 < p.length && p[j + 1] !== "]") {
          let hi = p[j + 1];
          j += 2;
          if (hi === "\\") { hi = esc(p[j]); j++; }
          for (let code = ch.charCodeAt(0); code <= hi.charCodeAt(0); code++) members.push(String.fromCharCode(code));
        } else members.push(ch);
      }
      if (p[j] !== "]") throw new Error("Unterminated [ in " + p);
      if (!members.length) throw new Error("Empty class in " + p);
      out += "(" + members.map(cmpEscapeLit).join("|") + ")";
      i = j + 1;
    } else { out += c; i++; }
  }
  return out;
}

// The scanner: the NFAs of all rules under one start state; accepting states remember their rule.
function cmpBuildScanner(rules) {
  const eps = [[]], sym = [], accept = new Map();
  let n = 1;
  rules.forEach((r, k) => {
    let nfa;
    try { nfa = regexToNFA(cmpExpandPattern(r.pattern)); } catch (e) { throw new Error("Token " + r.name + ": " + e.message); }
    const off = n;
    n += nfa.numStates;
    for (const t of nfa.trans) {
      const from = t.from + off, to = t.to + off;
      if (t.sym === EPSILON) (eps[from] = eps[from] || []).push(to);
      else { sym[from] = sym[from] || {}; (sym[from][t.sym] = sym[from][t.sym] || []).push(to); }
    }
    eps[0].push(nfa.start + off);
    accept.set(nfa.accept + off, k);
  });
  return { rules, eps, sym, accept };
}

function cmpClosure(sc, set) {
  const stack = [...set], out = new Set(set);
  while (stack.length) {
    const s = stack.pop();
    for (const t of sc.eps[s] || []) if (!out.has(t)) { out.add(t); stack.push(t); }
  }
  return out;
}

// One call of the scanner at position pos of chars: the longest lexeme any rule matches (the earliest rule on a
// tie). Returns { rule, start, end, readTo }: readTo is how far the scanner looked (exclusive); readTo > end when
// it read ahead of the lexeme and backed up. rule is -1 when nothing matches (a lexical error); at the end of the
// input rule is -2 (end of input).
function cmpScan(sc, chars, pos) {
  if (pos >= chars.length) return { rule: -2, start: pos, end: pos, readTo: pos };
  let cur = cmpClosure(sc, new Set([0]));
  let i = pos, readTo = pos, best = null;
  for (;;) {
    let acc = null;
    for (const s of cur) { const k = sc.accept.get(s); if (k !== undefined && (acc === null || k < acc)) acc = k; }
    if (acc !== null && i > pos) best = { rule: acc, end: i };
    if (i >= chars.length || cur.size === 0) break;
    readTo = i + 1;
    const next = new Set();
    for (const s of cur) { const t = sc.sym[s] && sc.sym[s][chars[i]]; if (t) t.forEach((x) => next.add(x)); }
    if (next.size === 0) break;
    cur = cmpClosure(sc, next);
    i++;
  }
  if (!best) return { rule: -1, start: pos, end: pos + 1, readTo: Math.max(readTo, pos + 1) };
  return { rule: best.rule, start: pos, end: best.end, readTo: Math.max(readTo, best.end) };
}

// ── The action language ──────────────────────────────────────────────
// Statements separated by ;  —  $$.name = expr   $$ = expr (the attribute val)   local = expr   call(...)
// Expressions: numbers, 'strings', $k (the attribute val of the k-th right-hand side symbol), $k.name, $$.name,
// locals, a bare word (its own name as a string, so  $$.type = int  works), calls, ( ), unary - and not,
// * /  + -  == != < > <= >=  and  or  and  c ? a : b. A rule with no action copies the attributes of $1.

function cmpTokenizeAction(src) {
  const out = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\$\$|\$\d+)|([A-Za-z_][A-Za-z_0-9]*)|(==|!=|<=|>=|[-+*/<>=?:(),.;]))/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(pos))) break;
      throw new Error("Unexpected character '" + src.slice(pos).trim()[0] + "' in action: " + src);
    }
    pos = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: "num", v: parseFloat(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "str", v: m[2].slice(1, -1).replace(/\\(.)/g, "$1") });
    else if (m[3] !== undefined) out.push({ t: "dollar", v: m[3] });
    else if (m[4] !== undefined) out.push({ t: "name", v: m[4] });
    else out.push({ t: "op", v: m[5] });
  }
  return out;
}

function cmpParseAction(src) {
  const toks = cmpTokenizeAction(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek() && peek().t === "op" && peek().v === v;
  const isWord = (v) => peek() && peek().t === "name" && peek().v === v;
  const expect = (v) => { if (!isOp(v)) throw new Error("Expected '" + v + "' in action: " + src); p++; };

  function primary() {
    const t = toks[p++];
    if (!t) throw new Error("Unexpected end of action: " + src);
    if (t.t === "num" || t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "dollar") return { k: "attr", who: t.v === "$$" ? 0 : +t.v.slice(1), name: null, self: t.v === "$$" };
    if (t.t === "name") {
      if (isOp("(")) {
        p++;
        const args = [];
        if (!isOp(")")) { args.push(expr()); while (isOp(",")) { p++; args.push(expr()); } }
        expect(")");
        return { k: "call", name: t.v, args };
      }
      return { k: "name", name: t.v };
    }
    if (t.t === "op" && t.v === "(") { const e = expr(); expect(")"); return e; }
    throw new Error("Unexpected '" + t.v + "' in action: " + src);
  }
  function postfix() {
    let e = primary();
    while (isOp(".")) {
      p++;
      const n = toks[p++];
      if (!n || n.t !== "name") throw new Error("Expected an attribute name after '.' in action: " + src);
      if (e.k !== "attr" || e.name !== null) throw new Error("Only $k.name and $$.name have attributes: " + src);
      e = { ...e, name: n.v };
    }
    return e;
  }
  function unary() {
    if (isOp("-")) { p++; return { k: "un", op: "-", a: unary() }; }
    if (isWord("not")) { p++; return { k: "un", op: "not", a: unary() }; }
    return postfix();
  }
  const bin = (next, ops) => () => {
    let a = next();
    while (peek() && peek().t === "op" && ops.includes(peek().v)) { const op = toks[p++].v; a = { k: "bin", op, a, b: next() }; }
    return a;
  };
  const mul = bin(unary, ["*", "/"]);
  const add = bin(mul, ["+", "-"]);
  const cmp = bin(add, ["==", "!=", "<", ">", "<=", ">="]);
  function and() { let a = cmp(); while (isWord("and")) { p++; a = { k: "bin", op: "and", a, b: cmp() }; } return a; }
  function or() { let a = and(); while (isWord("or")) { p++; a = { k: "bin", op: "or", a, b: and() }; } return a; }
  function expr() {
    const c = or();
    if (isOp("?")) { p++; const a = expr(); expect(":"); const b = expr(); return { k: "cond", c, a, b }; }
    return c;
  }
  function stmt() {
    const e = expr();
    if (isOp("=")) {
      p++;
      if (e.k === "attr" && e.self) return { k: "set", name: e.name || "val", e: expr() };
      if (e.k === "name") return { k: "local", name: e.name, e: expr() };
      throw new Error("Only $$, $$.name and a local name can be assigned in action: " + src);
    }
    return { k: "do", e };
  }
  const stmts = [];
  while (p < toks.length) {
    if (isOp(";")) { p++; continue; }
    stmts.push(stmt());
    if (p < toks.length) expect(";");
  }
  return stmts;
}

// Runs the parsed action. env: { args: [attribute objects of $1…], self: the attribute object of $$, locals: {},
// fn: { name: (...args) => value } }. Throws on errors in the action (an unknown function, a missing $k).
function cmpRunAction(ast, env) {
  const get = (e) => {
    switch (e.k) {
      case "lit": return e.v;
      case "attr": {
        const o = e.self ? env.self : env.args[e.who - 1];
        if (!o) throw new Error("$" + e.who + " does not exist in this rule");
        return o[e.name || "val"];
      }
      case "name": return Object.prototype.hasOwnProperty.call(env.locals, e.name) ? env.locals[e.name] : e.name;
      case "call": {
        const f = env.fn[e.name];
        if (!f) throw new Error("Unknown function " + e.name);
        return f(...e.args.map(get));
      }
      case "un": { const a = get(e.a); return e.op === "-" ? -a : !a; }
      case "cond": return get(e.c) ? get(e.a) : get(e.b);
      case "bin": {
        if (e.op === "and") return get(e.a) && get(e.b);
        if (e.op === "or") return get(e.a) || get(e.b);
        const a = get(e.a), b = get(e.b);
        switch (e.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": if (b === 0) throw new Error("Division by zero"); return a / b;
          case "==": return a === b;
          case "!=": return a !== b;
          case "<": return a < b;
          case ">": return a > b;
          case "<=": return a <= b;
          default: return a >= b;
        }
      }
    }
    return undefined;
  };
  for (const s of ast) {
    if (s.k === "set") env.self[s.name] = get(s.e);
    else if (s.k === "local") env.locals[s.name] = get(s.e);
    else get(s.e);
  }
}

// ── Grammar with actions ─────────────────────────────────────────────

// BNF as in the grammar tools, with an optional {{ action }} after the symbols of an alternative. The result has the
// shape the LR code expects (rules with lhs and rhs, augmented with S′ → S as rule 0), plus rule.action (source) and
// rule.ast. A <name> without a rule is a terminal, as in the grammar tools.
function cmpParseGrammar(text) {
  const rules = [];
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
  if (!lines.length) throw new Error("Empty grammar");
  // a line starting with | continues the previous rule's left-hand side
  let lhs = null;
  for (let line of lines) {
    const arrow = line.includes("->") ? "->" : line.includes("→") ? "→" : null;
    let rhsText;
    if (line.startsWith("|")) {
      if (lhs === null) throw new Error("A line cannot start with | before the first rule");
      rhsText = line.slice(1);
    } else {
      if (!arrow) throw new Error("Missing '->' in: " + line);
      const at = line.indexOf(arrow);
      lhs = line.slice(0, at).trim();
      if (!lhs) throw new Error("Missing left side in: " + line);
      rhsText = line.slice(at + arrow.length);
      line = null;
    }
    // pull the actions out: {{ … }} becomes a placeholder symbol of its alternative
    const actions = [];
    const withHoles = rhsText.replace(/\{\{([\s\S]*?)\}\}/g, (m, a) => { actions.push(a.trim()); return " @@" + (actions.length - 1) + "@@ "; });
    for (const alt of bnfAlternatives(withHoles)) {
      let action = null;
      const syms = [];
      for (const t of alt.toks) {
        const h = !t.quoted && /^@@(\d+)@@$/.exec(t.sym);
        if (h) action = actions[+h[1]];
        else syms.push({ sym: t.sym, quoted: t.quoted });
      }
      const eps = syms.length === 1 && ((!syms[0].quoted && ["eps", "epsilon", EPSILON].includes(syms[0].sym)) || (syms[0].quoted && syms[0].sym === ""));
      const rhs = eps ? [] : syms.filter((x) => !(x.quoted && x.sym === "")).map((x) => x.sym);
      const rule = { lhs, rhs, action, ast: null };
      if (action) rule.ast = cmpParseAction(action);
      rules.push(rule);
    }
  }
  if (!rules.length) throw new Error("No rules found");
  const startUser = rules[0].lhs;
  let aug = startUser + "′";
  while (rules.some((r) => r.lhs === aug)) aug += "′";
  rules.unshift({ lhs: aug, rhs: [startUser], action: null, ast: null });
  const nonterminals = new Set(rules.map((r) => r.lhs));
  const terminals = new Set(["$"]);
  for (const r of rules) for (const s of r.rhs) if (!nonterminals.has(s)) terminals.add(s);
  return { rules, start: aug, augmented: true, nonterminals, terminals, notes: [] };
}

// ── A compiled definition ────────────────────────────────────────────

// Token rules + grammar + action table. method: "SLR1" (default) or "LR1". Throws on errors in the definition.
function cmpCompile(tokenText, grammarText, method) {
  const tokenRules = cmpParseTokenRules(tokenText);
  const scanner = cmpBuildScanner(tokenRules);
  const grammar = cmpParseGrammar(grammarText);
  const m = method === "LR1" ? "LR1" : "SLR1";
  const auto = m === "LR1" ? buildLR1(grammar) : buildLR0(grammar);
  const tables = buildTables(grammar, auto, m);
  const tokenNames = new Set(tokenRules.filter((r) => !r.skip).map((r) => r.name));
  const missing = [...grammar.terminals].filter((t) => t !== "$" && !tokenNames.has(t));
  return { tokenRules, scanner, grammar, auto, tables, method: m, missing };
}

// Does the parser in this state have to look at the next token? Not when its one action is a reduction (a default
// reduction): it then reduces first, and the scanner is called later, if at all.
function cmpNeedsLookahead(tables, state) {
  const cells = Object.values(tables.action[state]);
  if (!cells.length) return true;
  const first = Array.isArray(cells[0]) ? null : cells[0];
  return !(first && first[0] === "r" && cells.every((c) => c === first));
}

// ── The run ──────────────────────────────────────────────────────────

const CMP_MAX_FRAMES = 600;

// Scanner and parser together on `input`. Returns { frames, accepted }. A frame describes the state after one event:
//   type   start | scan | skip | shift | reduce | accept | error
//   msg    what happened, in words
//   cursor the input is consumed up to here (the end of the last token scanned or skipped)
//   lex    { start, end, readTo, name? } of the last scanner call (null for the other events)
//   la     the look-ahead token's name, or null
//   tokens [{ name, lexeme, start, end, val, type?, entry? }] produced so far
//   stack  [{ state, sym, attrs }]    the forest [tree nodes], quads, symtab, messages: copies at this moment
function cmpRun(comp, input) {
  const { scanner, grammar, tables } = comp;
  const chars = [...input];
  const frames = [];
  const tokens = [], quads = [], symtab = [], messages = [];
  let stack = [{ state: 0, sym: null, attrs: {}, node: null }];
  let cursor = 0, la = null, lex = null, nid = 0, temps = 0;

  const snapshot = (type, msg) => {
    frames.push(JSON.parse(JSON.stringify({
      type, msg, cursor, lex, la, tokens,
      stack: stack.map((s) => ({ state: s.state, sym: s.sym, attrs: s.attrs })),
      forest: stack.filter((s) => s.node).map((s) => s.node),
      quads, symtab, messages,
    })));
  };

  const entryOf = (name) => {
    let i = symtab.findIndex((e) => e.name === name);
    if (i < 0) { symtab.push({ name, type: "" }); i = symtab.length - 1; }
    return i;
  };
  const fn = {
    newtemp: () => "t" + ++temps,
    emit: (op, a, b, r) => { quads.push([op, a === undefined ? "" : a, b === undefined ? "" : b, r === undefined ? "" : r]); },
    install: (name, type) => { symtab[entryOf(name)].type = type; },
    lookup: (name) => { const e = symtab.find((x) => x.name === name); return e ? e.type : ""; },
    widen: (a, b) => (a === "float" || b === "float" ? "float" : a || b),
    coerce: (place, from, to) => { if (from === to || !from || !to) return place; const t = fn.newtemp(); fn.emit(from + "2" + to, place, "", t); return t; },
    require: (cond, msg) => { if (!cond) messages.push(String(msg)); },
    error: (msg) => { messages.push(String(msg)); },
    trunc: (x) => Math.trunc(x),
  };

  snapshot("start", "Start: state 0, nothing read yet.");

  // One call of the scanner on behalf of the parser: skips white space and comments, then returns a token (or null at
  // the end, or false on a lexical error). Every call is a frame.
  const nextToken = () => {
    for (;;) {
      const r = cmpScan(scanner, chars, cursor);
      if (r.rule === -2) { lex = { start: cursor, end: cursor, readTo: cursor, name: "$" }; la = "$"; snapshot("scan", "The scanner is at the end of the input: it returns $."); return null; }
      if (r.rule === -1) { lex = { start: r.start, end: r.end, readTo: r.readTo }; snapshot("error", "Lexical error: no token rule matches at position " + r.start + ' (the character "' + chars[r.start] + '").'); return false; }
      const rule = scanner.rules[r.rule];
      const lexeme = chars.slice(r.start, r.end).join("");
      lex = { start: r.start, end: r.end, readTo: r.readTo, name: rule.name };
      const beyond = chars.slice(r.end, r.readTo).join("");
      const ahead = beyond ? " To see where it ends the scanner also read " + JSON.stringify(beyond) + " and backed up." : "";
      cursor = r.end;
      if (rule.skip) { snapshot("skip", "The scanner consumes " + JSON.stringify(lexeme) + " by the rule " + rule.name + " and discards it." + ahead); continue; }
      const tok = { name: rule.name, lexeme, start: r.start, end: r.end, val: lexeme };
      if (rule.name === "int" || rule.name === "float" || rule.name === "num") { tok.val = Number(lexeme); if (rule.name !== "num") tok.type = rule.name; }
      if (rule.name === "id") tok.entry = entryOf(lexeme);
      tokens.push(tok);
      la = rule.name;
      snapshot("scan", "The scanner consumes " + JSON.stringify(lexeme) + " and returns the token " + rule.name + "." + ahead);
      return tok;
    }
  };

  let tok = null, accepted = false;
  for (let guard = 0; guard < 4000 && frames.length < CMP_MAX_FRAMES; guard++) {
    const state = stack[stack.length - 1].state;
    if (la === null && cmpNeedsLookahead(tables, state)) {
      tok = nextToken();
      if (tok === false) break;
      la = tok ? tok.name : "$";
    }
    const sym = la === null ? Object.keys(tables.action[state])[0] : la;
    const entry = lrPickAction(tables.action[state][sym]);
    if (!entry) {
      const expected = Object.keys(tables.action[state]).filter((k) => tables.action[state][k]);
      snapshot("error", "Syntax error: the parser in state " + state + " cannot continue with " + (la || "$") + (expected.length ? "; it expects " + expected.join(" ") + "." : "."));
      break;
    }
    const act = lrDecode(entry);
    if (act.type === "accept") { snapshot("accept", "Accept: the input is a sentence of the grammar."); accepted = true; break; }
    if (act.type === "shift") {
      const attrs = { ...tok };
      stack.push({ state: act.next, sym: la, attrs, node: { id: nid++, sym: la, rule: null, attrs: { ...attrs }, children: [] } });
      la = null;
      lex = null;
      snapshot("shift", "Shift " + stack[stack.length - 1].sym + ": push state " + act.next + ".");
      continue;
    }
    const rule = grammar.rules[act.ruleIdx];
    const popped = stack.splice(stack.length - rule.rhs.length, rule.rhs.length);
    const self = {};
    if (rule.ast) {
      try { cmpRunAction(rule.ast, { args: popped.map((s) => s.attrs), self, locals: {}, fn }); }
      catch (e) { messages.push(e.message + " (rule " + act.ruleIdx + ")"); }
    } else if (popped.length) Object.assign(self, popped[0].attrs);
    const gt = lrGoto(tables, stack[stack.length - 1].state, rule.lhs);
    const node = { id: nid++, sym: rule.lhs, rule: act.ruleIdx, attrs: { ...self }, children: popped.map((s) => s.node) };
    stack.push({ state: gt, sym: rule.lhs, attrs: self, node });
    lex = null;
    snapshot("reduce", "Reduce by " + rule.lhs + " → " + (rule.rhs.join(" ") || EPSILON) + ": pop " + rule.rhs.length + ", go to state " + gt + "." + (rule.action ? " Action: " + rule.action : ""));
  }
  return { frames, accepted };
}
