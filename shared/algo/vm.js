// Two small machines to run what the compiler tool generates: a stack machine for postfix code (with labels, JUMP and
// JEQZ, as in the lecture notes) and a simulator for quadruples (with jumps to quadruple numbers). Each returns the
// whole run as a list of states, one per instruction executed, which a view replays with a stepper. No DOM access.

const VM_MAX_STEPS = 600;
const VM_BINARY = ["+", "-", "*", "/", "<", ">", "=", "<=", ">=", "!="];
const vmIsNumber = (s) => /^-?\d+(\.\d+)?$/.test(s);
const vmIsTemp = (s) => /^t\d+$/.test(s);
const vmRound = (x) => (typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x);

// One binary operation; comparisons give 1 or 0. Throws on division by zero.
function vmApply(op, a, b) {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": if (b === 0) throw new Error("division by zero"); return a / b;
    case "<": return a < b ? 1 : 0;
    case ">": return a > b ? 1 : 0;
    case "=": return a === b ? 1 : 0;
    case "<=": return a <= b ? 1 : 0;
    case ">=": return a >= b ? 1 : 0;
    case "!=": return a !== b ? 1 : 0;
  }
  throw new Error("unknown operator " + op);
}

// ── Postfix code ─────────────────────────────────────────────────────

// The tokens of a postfix program: { kind: number | name | label | def | op, text }. A label is L1, L2, …; L1: defines it.
function vmPostfixTokens(str) {
  return String(str).trim().split(/\s+/).filter(Boolean).map((t) => {
    if (vmIsNumber(t)) return { kind: "number", text: t };
    if (/^L\d+:$/.test(t)) return { kind: "def", text: t };
    if (/^L\d+$/.test(t)) return { kind: "label", text: t };
    if (t === ":=" || t === "JUMP" || t === "JEQZ" || VM_BINARY.includes(t)) return { kind: "op", text: t };
    if (/^[A-Za-z_][A-Za-z_0-9]*$/.test(t)) return { kind: "name", text: t };
    return null;
  });
}

// Does the text look like postfix code to run (every token known, at least one operator or a jump)?
function vmIsPostfix(str) {
  if (typeof str !== "string") return false;
  const toks = vmPostfixTokens(str);
  return toks.length > 1 && toks.every((t) => t !== null) && toks.some((t) => t.kind === "op");
}

// The names a program mentions that are variables (not temporaries): [name], in order of first appearance.
function vmVariables(items) {
  const out = [];
  for (const n of items) if (!vmIsTemp(n) && !out.includes(n)) out.push(n);
  return out;
}
const vmPostfixVariables = (str) => vmVariables(vmPostfixTokens(str).filter((t) => t && t.kind === "name").map((t) => t.text));

// Runs postfix code from the variables in init ({ name: number }). Returns { prog: [token], states: [state] }, state i
// being the machine after i instructions: { pc, stack: [text], vars, note, done, error }. An identifier is pushed as
// an address; an operator takes the values of its operands, and := stores into the address below the value.
function vmPostfix(str, init) {
  const prog = vmPostfixTokens(str);
  if (prog.some((t) => t === null)) throw new Error("not postfix code");
  const labels = {};
  prog.forEach((t, i) => { if (t.kind === "def") labels[t.text.slice(0, -1)] = i; });
  let pc = 0, stack = [], vars = { ...(init || {}) };
  const states = [];
  const snap = (note, extra) => states.push({ pc, stack: stack.map((x) => (x.ref !== undefined ? x.ref : x.label !== undefined ? x.label : String(vmRound(x)))), vars: { ...vars }, note, done: pc >= prog.length, ...extra });
  const value = (x) => {
    if (typeof x === "number") return x;
    if (x.ref !== undefined) { if (!(x.ref in vars)) throw new Error(x.ref + " has no value"); return vars[x.ref]; }
    throw new Error("a label is not a value");
  };
  const pop = () => { if (!stack.length) throw new Error("the stack is empty"); return stack.pop(); };
  snap("Start: the stack is empty.");
  while (pc < prog.length && states.length <= VM_MAX_STEPS) {
    const t = prog[pc];
    let note;
    try {
      if (t.kind === "number") { stack.push(Number(t.text)); note = "push " + t.text; pc++; }
      else if (t.kind === "name") { stack.push({ ref: t.text }); note = "push the address of " + t.text; pc++; }
      else if (t.kind === "label") { stack.push({ label: t.text }); note = "push the label " + t.text; pc++; }
      else if (t.kind === "def") { note = t.text + " marks this place"; pc++; }
      else if (t.text === ":=") {
        const v = value(pop()), a = pop();
        if (a.ref === undefined) throw new Error(":= needs an address on the left");
        vars[a.ref] = v;
        note = a.ref + " := " + vmRound(v);
        pc++;
      } else if (t.text === "JUMP") {
        const l = pop();
        if (l.label === undefined || !(l.label in labels)) throw new Error("JUMP needs a label that is defined");
        note = "jump to " + l.label;
        pc = labels[l.label];
      } else if (t.text === "JEQZ") {
        const l = pop(), c = value(pop());
        if (l.label === undefined || !(l.label in labels)) throw new Error("JEQZ needs a label that is defined");
        if (c === 0) { note = "the value is 0: jump to " + l.label; pc = labels[l.label]; } else { note = "the value is " + vmRound(c) + ", not 0: go on"; pc++; }
      } else {
        const b = value(pop()), a = value(pop());
        const r = vmApply(t.text, a, b);
        stack.push(r);
        note = vmRound(a) + " " + t.text + " " + vmRound(b) + " = " + vmRound(r);
        pc++;
      }
    } catch (e) {
      snap("Error at " + t.text + ": " + e.message + ".", { error: true, done: true });
      return { prog, states };
    }
    snap(note);
  }
  if (pc < prog.length) states.push({ ...states[states.length - 1], note: "Stopped after " + VM_MAX_STEPS + " instructions: a loop that does not end?", error: true, done: true });
  return { prog, states };
}

// ── Quadruples ───────────────────────────────────────────────────────

// The variables a quadruple program mentions (not temporaries, numbers or jump targets).
function vmQuadVariables(quads) {
  const names = [];
  for (const q of quads) for (const x of [q[1], q[2], q[3]]) if (typeof x === "string" && /^[A-Za-z_][A-Za-z_0-9]*$/.test(x)) names.push(x);
  // a name only written, never read, is not an input but still shown
  return vmVariables(names);
}

// Runs quadruples [op, arg1, arg2, result] (numbered from 1) from the variables in init. Returns { prog: quads, states }
// with state i after i quadruples: { pc (0-based index of the next one), vars, note, done, error }. := (or = with no
// second argument) copies; + - * / and comparisons compute; JEQZ jumps when its argument is 0, JUMP always; a target is (n).
function vmQuads(quads, init) {
  let pc = 0, vars = { ...(init || {}) };
  const states = [];
  const snap = (note, extra) => states.push({ pc, vars: { ...vars }, note, done: pc >= quads.length, ...extra });
  const val = (x) => {
    if (vmIsNumber(x)) return Number(x);
    if (!(x in vars)) throw new Error(x + " has no value");
    return vars[x];
  };
  const target = (r) => {
    const m = /^\((\d+)\)$/.exec(r);
    if (!m) throw new Error("the jump target " + (r === "?" ? "has not been patched" : JSON.stringify(r) + " is not a quadruple number (n)"));
    return Number(m[1]) - 1;
  };
  snap("Start: the first quadruple is next.");
  while (pc < quads.length && states.length <= VM_MAX_STEPS) {
    const [op, a, b, r] = quads[pc];
    let note;
    try {
      if (op === ":=" || (op === "=" && b === "") || /^[a-z]+2[a-z]+$/.test(op)) { vars[r] = val(a); note = r + " := " + vmRound(vars[r]); pc++; }
      else if (VM_BINARY.includes(op)) { const x = val(a), y = val(b); vars[r] = vmApply(op, x, y); note = r + " = " + vmRound(x) + " " + op + " " + vmRound(y) + " = " + vmRound(vars[r]); pc++; }
      else if (op === "JEQZ") { const c = val(a); if (c === 0) { pc = target(r); note = a + " is 0: jump to " + r; } else { note = a + " is " + vmRound(c) + ", not 0: go on"; pc++; } }
      else if (op === "JUMP") { pc = target(r); note = "jump to " + r; }
      else throw new Error("unknown operation " + op);
    } catch (e) {
      snap("Error in quadruple " + (pc + 1) + ": " + e.message + ".", { error: true, done: true });
      return { prog: quads, states };
    }
    snap(note);
  }
  if (pc < quads.length) states.push({ ...states[states.length - 1], note: "Stopped after " + VM_MAX_STEPS + " quadruples: a loop that does not end?", error: true, done: true });
  return { prog: quads, states };
}
