// An interpreter for a small block-structured language, to compare scoping rules (static, dynamic) and parameter-passing
// modes (value, reference, value-result, name). A run is the list of events (declarations, assignments, lookups, calls...), each with
// the state after it: the active frames, the locations they reach and the arrays. A view replays them with a stepper. No DOM access.
//
//   scoParse(src) -> program      throws an Error with .line
//   scoRun(src, { scoping: "static" | "dynamic", passing: "value" | "reference" | "valueresult" | "name", maxSteps })
//     -> { events, output: [string], error: { message, line } | null, done }
//   event: { kind, text, line, fine, steps, out, state, ...extra }
//     kind: declare assign test print call copyout return thunk lookup error done; fine events (lookup, thunk) are skipped by a coarse stepper
//     state: { frames: [{ id, label, kind, staticId, dynId, binds }], store: [{ loc, value }], arrays: [{ id, lo, hi, cells }] }
//       bind: { name, kind: "loc", loc } | { name, kind: "proc" | "func", params } | { name, kind: "thunk", text, evals }
//       value: number | { ref: array id }
//     lookup extra: { name, chain: [frame id], hit: frame id | null }; call extra: { bindings: [{ param, how, text }] }
//
// An array variable holds a reference to the array (assignment rebinds it); an array element is a location of its own.
// The location of an l-value argument is fixed at the call. Arguments are evaluated left to right; value-result copies out in
// parameter order. Name: the argument is a thunk, evaluated in the caller's frame under static scoping and in the frame that
// uses it under dynamic scoping; assigning to such a parameter assigns to the argument, which must be a variable or an element.
const SCO_MAX_STEPS = 500;
const SCO_MAX_EVENTS = 5000;
const SCO_KEYWORDS = new Set(["var", "array", "proc", "func", "call", "print", "return", "if", "else", "while"]);
const SCO_PASSING = ["value", "reference", "valueresult", "name"];

function scoError(message, line) {
  const e = new Error(message);
  e.line = line;
  return e;
}

function scoTokens(src) {
  const toks = [];
  const re = /\s+|\/\/[^\n]*|(\d+)|([A-Za-z_]\w*)|(\.\.|==|!=|<=|>=|[-+*\/<>=(){}\[\],;])/y;
  let line = 1;
  while (re.lastIndex < src.length) {
    const at = re.lastIndex, m = re.exec(src);
    if (!m) throw scoError("unexpected character '" + src[at] + "'", line);
    if (m[1] !== undefined) toks.push({ t: "num", v: +m[1], line });
    else if (m[2] !== undefined) toks.push({ t: SCO_KEYWORDS.has(m[2]) ? m[2] : "id", v: m[2], line });
    else if (m[3] !== undefined) toks.push({ t: m[3], line });
    for (const c of m[0]) if (c === "\n") line++;
  }
  toks.push({ t: "eof", line });
  return toks;
}

// The program: { k: "program", body: [statement] }
function scoParse(src) {
  const toks = scoTokens(src);
  let p = 0;
  const at = (t) => toks[p].t === t;
  const next = () => toks[p++];
  const accept = (t) => (at(t) ? next() : null);
  const found = (tk) => (tk.t === "eof" ? "the end of the program" : tk.t === "num" ? tk.v : tk.t === "id" ? tk.v : "'" + tk.t + "'");
  const eat = (t, what) => {
    if (!at(t)) throw scoError("expected " + (what || "'" + t + "'") + ", found " + found(toks[p]), toks[p].line);
    return next();
  };
  const list = (close, item) => {
    const out = [];
    if (!at(close)) do out.push(item()); while (accept(","));
    eat(close);
    return out;
  };
  const params = () => {
    eat("(");
    const ps = list(")", () => eat("id", "a parameter name").v);
    if (new Set(ps).size !== ps.length) throw scoError("a parameter name is repeated", toks[p - 1].line);
    return ps;
  };

  const primary = () => {
    const tk = next();
    if (tk.t === "num") return { k: "num", v: tk.v, line: tk.line };
    if (tk.t === "(") { const e = expr(); eat(")"); return e; }
    if (tk.t === "id") {
      if (accept("[")) { const index = expr(); eat("]"); return { k: "index", name: tk.v, index, line: tk.line }; }
      if (accept("(")) return { k: "callx", name: tk.v, args: list(")", expr), line: tk.line };
      return { k: "name", name: tk.v, line: tk.line };
    }
    throw scoError("expected an expression, found " + found(tk), tk.line);
  };
  const unary = () => (at("-") ? { k: "neg", e: (next(), unary()), line: toks[p - 1].line } : primary());
  const binary = (ops, sub) => () => {
    let l = sub();
    while (ops.includes(toks[p].t)) { const op = next(); l = { k: "bin", op: op.t, l, r: sub(), line: op.line }; }
    return l;
  };
  const term = binary(["*", "/"], unary);
  const sum = binary(["+", "-"], term);
  const expr = binary(["==", "!=", "<", ">", "<=", ">="], sum);

  const block = () => {
    const open = eat("{");
    const body = [];
    while (!at("}")) {
      if (at("eof")) throw scoError("expected '}', found the end of the program", toks[p].line);
      body.push(stmt());
    }
    next();
    return { k: "block", body, line: open.line };
  };
  const stmt = () => {
    const tk = toks[p], line = tk.line;
    switch (tk.t) {
      case "var": { next(); const name = eat("id", "a name").v; eat("="); const init = expr(); eat(";"); return { k: "var", name, init, line }; }
      case "array": {
        next();
        const name = eat("id", "a name").v;
        eat("[");
        const lo = expr();
        eat("..");
        const hi = expr();
        eat("]");
        let init = null;
        if (accept("=")) { eat("{"); init = list("}", expr); }
        eat(";");
        return { k: "array", name, lo, hi, init, line };
      }
      case "proc": case "func": { next(); const name = eat("id", "a name").v; const ps = params(); return { k: tk.t, name, params: ps, body: block(), line }; }
      case "call": { next(); const name = eat("id", "a name").v; eat("("); const args = list(")", expr); eat(";"); return { k: "call", name, args, line }; }
      case "print": { next(); const e = expr(); eat(";"); return { k: "print", e, line }; }
      case "return": { next(); const e = expr(); eat(";"); return { k: "return", e, line }; }
      case "if": {
        next();
        eat("(");
        const cond = expr();
        eat(")");
        const then = block();
        return { k: "if", cond, then, other: accept("else") ? block() : null, line };
      }
      case "while": { next(); eat("("); const cond = expr(); eat(")"); return { k: "while", cond, body: block(), line }; }
      case "{": return block();
      case "id": {
        next();
        let target = { k: "name", name: tk.v, line };
        if (accept("[")) { const index = expr(); eat("]"); target = { k: "index", name: tk.v, index, line }; }
        eat("=", "'=' (or a statement)");
        const value = expr();
        eat(";");
        return { k: "assign", target, value, line };
      }
    }
    throw scoError("expected a statement, found " + found(tk), line);
  };

  const body = [];
  while (!at("eof")) body.push(stmt());
  return { k: "program", body };
}

const SCO_PREC = { "==": 1, "!=": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "+": 2, "-": 2, "*": 3, "/": 3 };

// An expression as source text
function scoExprText(e) {
  switch (e.k) {
    case "num": return String(e.v);
    case "name": return e.name;
    case "index": return e.name + "[" + scoExprText(e.index) + "]";
    case "callx": return e.name + "(" + e.args.map(scoExprText).join(", ") + ")";
    case "neg": return "-" + scoExprText(e.e);
    case "bin": {
      const side = (x) => (x.k === "bin" && SCO_PREC[x.op] < SCO_PREC[e.op] ? "(" + scoExprText(x) + ")" : scoExprText(x));
      return side(e.l) + " " + e.op + " " + side(e.r);
    }
  }
  return "?";
}

const scoIsLvalue = (e) => e.k === "name" || e.k === "index";

function scoRun(src, opts = {}) {
  const scoping = opts.scoping === "dynamic" ? "dynamic" : "static";
  const passing = SCO_PASSING.includes(opts.passing) ? opts.passing : "value";
  const maxSteps = opts.maxSteps || SCO_MAX_STEPS;
  let program;
  try {
    program = scoParse(src);
  } catch (e) {
    return { events: [], output: [], error: { message: e.message, line: e.line }, done: true };
  }

  const store = [], arrays = [], active = [], events = [], output = [];
  let steps = 0, nextFrame = 0, curLine = 1, error = null;
  const STOP = { stop: true };
  class Return { constructor(value) { this.value = value; } }

  const show = (v) => (typeof v === "number" ? String(v) : "[" + arrays[v.ref].cells.map((c) => show(store[c])).join(", ") + "]");
  const cloneValue = (v) => (typeof v === "number" ? v : { ref: v.ref });
  const alloc = (v) => store.push(v) - 1;

  function snapshot() {
    const locs = new Set(), arrs = new Set();
    const visit = (loc) => {
      if (locs.has(loc)) return;
      locs.add(loc);
      const v = store[loc];
      if (typeof v === "object" && !arrs.has(v.ref)) { arrs.add(v.ref); arrays[v.ref].cells.forEach(visit); }
    };
    const frames = active.map((f) => ({
      id: f.id, label: f.label, kind: f.kind, staticId: f.staticF ? f.staticF.id : null, dynId: f.dynF ? f.dynF.id : null,
      binds: [...f.binds].map(([name, b]) => {
        if (b.kind === "loc") { visit(b.loc); return { name, kind: "loc", loc: b.loc }; }
        if (b.kind === "thunk") return { name, kind: "thunk", text: scoExprText(b.expr), evals: b.evals };
        return { name, kind: b.decl.k, params: b.decl.params.slice() };
      }),
    }));
    return {
      frames,
      store: [...locs].sort((a, b) => a - b).map((loc) => ({ loc, value: cloneValue(store[loc]) })),
      arrays: [...arrs].sort((a, b) => a - b).map((id) => ({ id, lo: arrays[id].lo, hi: arrays[id].hi, cells: arrays[id].cells.slice() })),
    };
  }
  function emit(kind, text, extra, fine) {
    events.push({ kind, text, line: curLine, fine: !!fine, steps, out: output.length, state: snapshot(), ...extra });
    if (events.length > SCO_MAX_EVENTS) fail("Stopped after " + SCO_MAX_EVENTS + " events");
  }
  function fail(message) {
    if (!error) {
      error = { message, line: curLine };
      events.push({ kind: "error", text: message, line: curLine, fine: false, steps, out: output.length, state: snapshot() });
    }
    throw STOP;
  }
  function step() {
    if (++steps > maxSteps) fail("Stopped after " + maxSteps + " steps: a loop that does not end?");
  }

  const newFrame = (label, kind, staticF, dynF) => ({ id: nextFrame++, label, kind, staticF, dynF, binds: new Map() });

  // The binding of a name: the frames are searched along the static links or along the dynamic ones
  function resolve(name, env) {
    const chain = [];
    for (let f = env; f; f = scoping === "static" ? f.staticF : f.dynF) {
      chain.push(f.id);
      if (f.binds.has(name)) {
        emit("lookup", name + " found in " + f.label, { name, chain, hit: f.id }, true);
        return f.binds.get(name);
      }
    }
    emit("lookup", name + " not found", { name, chain, hit: null }, true);
    return fail(name + " is not declared");
  }
  const thunkEnv = (b, env) => (scoping === "static" ? b.env : env);

  function readBinding(b, env, name) {
    if (b.kind === "loc") return store[b.loc];
    if (b.kind === "thunk") {
      b.evals++;
      const v = evalX(b.expr, thunkEnv(b, env));
      emit("thunk", name + " is evaluated: " + scoExprText(b.expr) + " = " + show(v), { name }, true);
      return v;
    }
    return fail(name + " is a " + b.decl.k + ", not a value");
  }
  function arrayOf(name, env) {
    const v = readBinding(resolve(name, env), env, name);
    if (typeof v !== "object") fail(name + " is not an array");
    return arrays[v.ref];
  }
  function cellLoc(name, index, env) {
    const arr = arrayOf(name, env), i = evalNum(index, env);
    if (i < arr.lo || i > arr.hi) fail(name + "[" + i + "] is out of range " + arr.lo + ".." + arr.hi);
    return arr.cells[i - arr.lo];
  }
  // The location an l-value stands for
  function lvalLoc(node, env) {
    if (node.k === "index") return cellLoc(node.name, node.index, env);
    const b = resolve(node.name, env);
    if (b.kind === "loc") return b.loc;
    if (b.kind === "thunk") {
      if (!scoIsLvalue(b.expr)) fail("cannot assign to " + node.name + ": its argument " + scoExprText(b.expr) + " is not a variable");
      b.evals++;
      return lvalLoc(b.expr, thunkEnv(b, env));
    }
    return fail(node.name + " is a " + b.decl.k + ", not a variable");
  }

  function evalNum(e, env) {
    const v = evalX(e, env);
    if (typeof v !== "number") fail("an array is not a number");
    return v;
  }
  function evalX(e, env) {
    switch (e.k) {
      case "num": return e.v;
      case "name": return readBinding(resolve(e.name, env), env, e.name);
      case "index": return store[cellLoc(e.name, e.index, env)];
      case "neg": return -evalNum(e.e, env);
      case "callx": return callProc(e.name, e.args, env, true);
      case "bin": {
        const a = evalNum(e.l, env), b = evalNum(e.r, env);
        switch (e.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": if (b === 0) fail("division by zero"); return Math.trunc(a / b);
          case "==": return a === b ? 1 : 0;
          case "!=": return a !== b ? 1 : 0;
          case "<": return a < b ? 1 : 0;
          case ">": return a > b ? 1 : 0;
          case "<=": return a <= b ? 1 : 0;
          case ">=": return a >= b ? 1 : 0;
        }
      }
    }
    return fail("cannot evaluate " + scoExprText(e));
  }

  function callProc(name, argNodes, env, asValue) {
    const b = resolve(name, env), d = b.decl;
    if (b.kind !== "proc") fail(name + " is not a procedure");
    if (asValue && d.k !== "func") fail(name + " is a proc and returns no value");
    if (argNodes.length !== d.params.length) fail(name + " takes " + d.params.length + " arguments, " + argNodes.length + " given");
    step();
    const F = newFrame(name, d.k, b.home, env);
    const bindings = [], copyOut = [];
    d.params.forEach((pn, i) => {
      const a = argNodes[i], text = scoExprText(a);
      if (passing === "name") {
        F.binds.set(pn, { kind: "thunk", expr: a, env, evals: 0 });
        bindings.push({ param: pn, how: "thunk", text });
      } else if (passing === "reference") {
        const alias = scoIsLvalue(a), loc = alias ? lvalLoc(a, env) : alloc(evalX(a, env));
        F.binds.set(pn, { kind: "loc", loc });
        bindings.push({ param: pn, how: alias ? "alias" : "temp", text, loc });
      } else if (passing === "valueresult" && scoIsLvalue(a)) {
        const argLoc = lvalLoc(a, env), loc = alloc(cloneValue(store[argLoc]));
        F.binds.set(pn, { kind: "loc", loc });
        copyOut.push({ param: pn, loc, argLoc, text });
        bindings.push({ param: pn, how: "copy-in", text, loc });
      } else {
        const loc = alloc(evalX(a, env));
        F.binds.set(pn, { kind: "loc", loc });
        bindings.push({ param: pn, how: "copy", text, loc });
      }
    });
    active.push(F);
    emit("call", "call " + name + "(" + argNodes.map(scoExprText).join(", ") + ")", { bindings });
    let result;
    try {
      execStatements(d.body.body, F);
    } catch (e) {
      if (!(e instanceof Return)) throw e;
      result = e.value;
    }
    for (const c of copyOut) {
      store[c.argLoc] = cloneValue(store[c.loc]);
      emit("copyout", c.param + " is copied back to " + c.text, { param: c.param });
    }
    if (asValue && result === undefined) fail(name + " ended without return");
    emit("return", "return from " + name + (result === undefined ? "" : ": " + show(result)));
    active.pop();
    return result;
  }

  function execStatements(list, env) {
    for (const s of list) exec(s, env);
  }
  function execBlock(b, env) {
    const F = newFrame("block", "block", env, env), depth = active.length;
    active.push(F);
    try {
      execStatements(b.body, F);
    } finally {
      active.length = depth;
    }
  }
  function declare(env, name, binding) {
    if (env.binds.has(name)) fail(name + " is already declared here");
    env.binds.set(name, binding);
  }

  function exec(s, env) {
    curLine = s.line;
    step();
    switch (s.k) {
      case "var": {
        const v = evalX(s.init, env), loc = alloc(v);
        declare(env, s.name, { kind: "loc", loc });
        emit("declare", "var " + s.name + " = " + show(v), { loc });
        return;
      }
      case "array": {
        const lo = evalNum(s.lo, env), hi = evalNum(s.hi, env);
        if (hi < lo - 1 || hi - lo > 99) fail("an array needs a size from 0 to 100");
        const init = s.init ? s.init.map((e) => evalNum(e, env)) : [];
        if (init.length > hi - lo + 1) fail("more initial values than " + s.name + " has elements");
        const cells = [];
        for (let i = 0; i <= hi - lo; i++) cells.push(alloc(i < init.length ? init[i] : 0));
        arrays.push({ lo, hi, cells });
        const loc = alloc({ ref: arrays.length - 1 });
        declare(env, s.name, { kind: "loc", loc });
        emit("declare", "array " + s.name + "[" + lo + ".." + hi + "]", { loc });
        return;
      }
      case "proc": case "func":
        declare(env, s.name, { kind: "proc", decl: s, home: env });
        emit("declare", s.k + " " + s.name + "(" + s.params.join(", ") + ")");
        return;
      case "assign": {
        const v = evalX(s.value, env), loc = lvalLoc(s.target, env);
        store[loc] = cloneValue(v);
        emit("assign", scoExprText(s.target) + " = " + show(v), { loc });
        return;
      }
      case "print": {
        const text = show(evalX(s.e, env));
        output.push(text);
        emit("print", "print " + text);
        return;
      }
      case "call":
        callProc(s.name, s.args, env, false);
        return;
      case "return": {
        const f = [...active].reverse().find((x) => x.kind !== "block");
        if (!f || f.kind !== "func") fail("return is only for a func");
        throw new Return(evalX(s.e, env));
      }
      case "if": {
        const c = evalNum(s.cond, env);
        emit("test", "if (" + scoExprText(s.cond) + ") is " + (c ? "true" : "false"));
        if (c) execBlock(s.then, env); else if (s.other) execBlock(s.other, env);
        return;
      }
      case "while":
        for (;;) {
          curLine = s.line;
          step();
          const c = evalNum(s.cond, env);
          emit("test", "while (" + scoExprText(s.cond) + ") is " + (c ? "true" : "false"));
          if (!c) return;
          execBlock(s.body, env);
        }
      case "block":
        execBlock(s, env);
        return;
    }
  }

  const global = newFrame("global", "global", null, null);
  active.push(global);
  try {
    execStatements(program.body, global);
    curLine = program.body.length ? program.body[program.body.length - 1].line : 1;
    emit("done", "The program has ended");
  } catch (e) {
    if (e !== STOP && !(e instanceof Return)) throw e;
  }
  return { events, output, error, done: true };
}
