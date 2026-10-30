// Pure regular-language algorithms: regex → ε-NFA (Thompson-style), NFA → DFA (subset
// construction), DFA minimisation (table filling), and DFA helpers. No DOM
// access and no HTML: step records carry data only; the tool formats them.
// Depends on grammar.js (EPSILON).
//
// NFA: { start, accept, trans: [{ from, sym, to }], numStates }   (states are ints)
// DFA: { dfaStates: Set<nfaState>[], dfaAccepts: Set<int>, dfaTrans: [{from, sym, to}], alpha }
//      The start state is always 0.

// ── Regex → NFA (Thompson-style construction) ─────────────────────────
// Thompson's fragments for a symbol, ε, union, concatenation and star; + and ? have constructions of their own, and
// concatenation joins two fragments by an ε-move instead of merging their end states.
// Grammar (highest precedence first):
//   atom   ::= literal | 'ε' | '(' expr ')' | '\' any
//   unary  ::= atom ( '*' | '+' | '?' )*
//   concat ::= unary unary*
//   expr   ::= concat ( '|' concat )*
//
// onStep, if given, is called after every construction step with
//   { op: "symbol"|"eps"|"union"|"concat"|"star"|"plus"|"opt", ch (symbol only),
//     frag: { start, accept }, newStates: int[], newTrans: [...],
//     snapshot: every transition created so far,
//     span: [lo, hi)       the part of the expression this step builds (its characters),
//     opAt: index of the operator character (| * + ?), or null for symbols and concatenation,
//     operands: [{ start, accept, span }]   the fragments being combined (none for symbols) }
function regexToNFA(str, onStep) {
  let next = 0;
  const fresh = () => next++;
  const allTrans = [];

  function done(op, frag, newStates, newTrans, extra) {
    if (onStep) {
      allTrans.push(...newTrans);
      onStep({
        op, ...extra,
        frag: { start: frag.start, accept: frag.accept },
        newStates: [...newStates],
        newTrans: newTrans.map((t) => ({ ...t })),
        snapshot: allTrans.map((t) => ({ ...t })),
      });
    }
    return frag;
  }

  const operand = (f) => ({ start: f.start, accept: f.accept, span: [...f.span] });

  function symbol(ch, op, span) {
    const s = fresh(), t = fresh();
    const newT = [{ from: s, sym: ch, to: t }];
    return done(op, { start: s, accept: t, trans: newT, span }, [s, t], newT, { ...(op === "symbol" ? { ch } : {}), span: [...span], opAt: null, operands: [] });
  }

  function union(a, b, opAt) {
    const s = fresh(), t = fresh();
    const newT = [
      { from: s, sym: EPSILON, to: a.start },
      { from: s, sym: EPSILON, to: b.start },
      { from: a.accept, sym: EPSILON, to: t },
      { from: b.accept, sym: EPSILON, to: t },
    ];
    const span = [a.span[0], b.span[1]];
    return done("union", { start: s, accept: t, trans: [...a.trans, ...b.trans, ...newT], span }, [s, t], newT, { span: [...span], opAt, operands: [operand(a), operand(b)] });
  }

  function concat(a, b) {
    const newT = [{ from: a.accept, sym: EPSILON, to: b.start }];
    const span = [a.span[0], b.span[1]];
    return done("concat", { start: a.start, accept: b.accept, trans: [...a.trans, ...b.trans, ...newT], span }, [], newT, { span: [...span], opAt: null, operands: [operand(a), operand(b)] });
  }

  function star(a, opAt) {
    const s = fresh(), t = fresh();
    const newT = [
      { from: s, sym: EPSILON, to: a.start }, // enter loop
      { from: s, sym: EPSILON, to: t }, // skip (zero repetitions)
      { from: a.accept, sym: EPSILON, to: a.start }, // repeat
      { from: a.accept, sym: EPSILON, to: t }, // exit loop
    ];
    const span = [a.span[0], opAt + 1];
    return done("star", { start: s, accept: t, trans: [...a.trans, ...newT], span }, [s, t], newT, { span: [...span], opAt, operands: [operand(a)] });
  }

  function plus(a, opAt) {
    const s = fresh(), t = fresh();
    const newT = [
      { from: s, sym: EPSILON, to: a.start }, // must pass through at least once
      { from: a.accept, sym: EPSILON, to: a.start }, // repeat
      { from: a.accept, sym: EPSILON, to: t }, // exit
    ];
    const span = [a.span[0], opAt + 1];
    return done("plus", { start: s, accept: t, trans: [...a.trans, ...newT], span }, [s, t], newT, { span: [...span], opAt, operands: [operand(a)] });
  }

  function opt(a, opAt) {
    const s = fresh(), t = fresh();
    const newT = [
      { from: s, sym: EPSILON, to: a.start }, // take r
      { from: s, sym: EPSILON, to: t }, // skip r
      { from: a.accept, sym: EPSILON, to: t },
    ];
    const span = [a.span[0], opAt + 1];
    return done("opt", { start: s, accept: t, trans: [...a.trans, ...newT], span }, [s, t], newT, { span: [...span], opAt, operands: [operand(a)] });
  }

  // ── Recursive-descent parser ──
  let pos = 0, depth = 0; // depth: open parentheses
  const peek = () => (pos < str.length ? str[pos] : null);

  function parseExpr() {
    let node = parseConcat();
    while (peek() === "|") {
      const opAt = pos++;
      node = union(node, parseConcat(), opAt);
    }
    return node;
  }

  function parseConcat() {
    if (peek() === ")" && depth === 0) throw new Error("Unmatched ) at position " + pos);
    if (peek() === null || peek() === "|" || peek() === ")") throw new Error("Empty alternative at position " + pos + ": write ε for the empty string");
    let node = parseUnary();
    while (peek() !== null && peek() !== ")" && peek() !== "|") node = concat(node, parseUnary());
    return node;
  }

  function parseUnary() {
    let node = parseAtom();
    while (peek() === "*" || peek() === "+" || peek() === "?") {
      const opAt = pos, op = str[pos++];
      node = op === "*" ? star(node, opAt) : op === "+" ? plus(node, opAt) : opt(node, opAt);
    }
    return node;
  }

  // One symbol: a character, or a surrogate pair (a character outside the basic plane) as one symbol.
  function takeSymbol() {
    const c = str.codePointAt(pos);
    const sym = String.fromCodePoint(c);
    pos += sym.length;
    return sym;
  }

  function parseAtom() {
    const ch = peek();
    if (ch === null) throw new Error("Unexpected end of expression");
    if (ch === "(") {
      const lo = pos++;
      if (peek() === ")") throw new Error("Empty group at position " + lo + ": write ε for the empty string");
      depth++;
      const inner = parseExpr();
      if (peek() !== ")") throw new Error("Unmatched ( at position " + lo);
      depth--;
      pos++;
      inner.span = [lo, pos]; // later steps treat the parentheses as part of the operand
      return inner;
    }
    if (ch === ")") throw new Error("Unmatched ) at position " + pos);
    if (ch === "|" || ch === "*" || ch === "+" || ch === "?") throw new Error("Unexpected operator '" + ch + "' at position " + pos);
    if (ch === "\\") {
      // Escape: treat next character as a literal symbol
      const lo = pos++;
      if (peek() === null) throw new Error("Trailing \\");
      if (peek() === EPSILON) throw new Error("ε cannot be escaped: it always means the empty string");
      return symbol(takeSymbol(), "symbol", [lo, pos]);
    }
    const lo = pos;
    const sym = takeSymbol();
    return sym === EPSILON ? symbol(EPSILON, "eps", [lo, pos]) : symbol(sym, "symbol", [lo, pos]);
  }

  if (!str.trim()) throw new Error("Empty expression");
  const frag = parseExpr();
  if (pos < str.length) throw new Error(str[pos] === ")" ? "Unmatched ) at position " + pos : "Unexpected character '" + str[pos] + "' at position " + pos);
  return { start: frag.start, accept: frag.accept, trans: frag.trans, numStates: next };
}

// The subset construction gives up above this many DFA states (the worst case is exponential in the NFA).
const RX_MAX_DFA_STATES = 2000;
// The minimisation records its steps and the pair table up to this many DFA states; above it only the result.
const RX_MAX_TABLE_STATES = 64;

// ── NFA → DFA (subset construction) ───────────────────────────────────
// steps (data only):
//   { type: "init", dfaIdx: 0, start, closure }
//   { type: "process", dfaIdx, set }
//   { type: "empty", dfaIdx, sym }
//   { type: "trans", dfaIdx, sym, toIdx, isNew, mv, closure }
//   { type: "done", nStates, nAccepts }
function subsetConstruct(nfa, maxStates = RX_MAX_DFA_STATES) {
  const { start, accept, trans } = nfa;

  // ε-closure: all states reachable from `seeds` via ε-transitions only
  function epsClosure(seeds) {
    const C = new Set(seeds);
    const stk = [...seeds];
    while (stk.length) {
      const s = stk.pop();
      for (const t of trans)
        if (t.from === s && t.sym === EPSILON && !C.has(t.to)) {
          C.add(t.to);
          stk.push(t.to);
        }
    }
    return C;
  }

  // move: NFA states reachable from `states` on symbol `sym` (no ε)
  function move(states, sym) {
    const R = new Set();
    for (const s of states) for (const t of trans) if (t.from === s && t.sym === sym) R.add(t.to);
    return R;
  }

  // Canonical string key for a set of NFA states
  const key = (S) => [...S].sort((a, b) => a - b).join(",");

  const alphabet = new Set();
  for (const t of trans) if (t.sym !== EPSILON) alphabet.add(t.sym);
  const alpha = [...alphabet].sort();

  const dfaStates = []; // array of Set<nfaStateIdx>
  const dfaMap = {}; // key → dfaIdx
  const dfaTrans = []; // { from, sym, to }
  const steps = [];

  const S0 = epsClosure([start]);
  dfaStates.push(S0);
  dfaMap[key(S0)] = 0;
  steps.push({ type: "init", dfaIdx: 0, start, closure: S0 });

  let wi = 0;
  while (wi < dfaStates.length) {
    const S = dfaStates[wi];
    steps.push({ type: "process", dfaIdx: wi, set: S });

    for (const sym of alpha) {
      const mv = move(S, sym);
      if (!mv.size) {
        steps.push({ type: "empty", dfaIdx: wi, sym });
        continue;
      }
      const T = epsClosure([...mv]);
      const k = key(T);
      const isNew = dfaMap[k] === undefined;
      let toIdx;
      if (isNew) {
        if (dfaStates.length >= maxStates) throw new Error("The DFA has more than " + maxStates + " states: the subset construction stops here");
        toIdx = dfaStates.length;
        dfaStates.push(T);
        dfaMap[k] = toIdx;
      } else toIdx = dfaMap[k];
      dfaTrans.push({ from: wi, sym, to: toIdx });
      steps.push({ type: "trans", dfaIdx: wi, sym, toIdx, isNew, mv, closure: T });
    }
    wi++;
  }

  // DFA accept states: any DFA state containing the NFA accept state
  const dfaAccepts = new Set();
  dfaStates.forEach((S, i) => {
    if (S.has(accept)) dfaAccepts.add(i);
  });

  steps.push({ type: "done", nStates: dfaStates.length, nAccepts: dfaAccepts.size });
  return { dfaStates, dfaAccepts, dfaTrans, alpha, steps };
}

// ── DFA minimisation — table-filling algorithm ────────────────────────
// Input: the result of subsetConstruct. The result has the same shape (plus the
// extra fields below) so renderers, generateExamples and dfaRun accept it.
// Extra fields: groups, origN, n, DEAD, origScData, renumMap, alreadyMinimal, tooLarge.
// DEAD is the index of the implicit dead state (origN), or -1 if none was needed. The dead state completes the
// DFA for the table; it is not one of the groups, so the minimal DFA returned has no dead state: it is partial.
// Each marked pair has a witness, a string on which exactly one of the two states accepts.
// With more than maxTable states (RX_MAX_TABLE_STATES) no step but the result is recorded (tooLarge: true).
// steps (data only):
//   { type: "mark-base", markedSnapshot, activePair: [i, j], witness: "" }
//   { type: "mark-refine", markedSnapshot, activePair: [i, j], pass, sym, di, dj, witness }
//   { type: "no-change", markedSnapshot, activePair: null, pass }
//   { type: "result", markedSnapshot, equivPairs, activePair: null, groups, origN, alreadyMinimal }
function minimizeDFA(scData, maxTable = RX_MAX_TABLE_STATES) {
  const { dfaStates, dfaAccepts, dfaTrans, alpha } = scData;
  const origN = dfaStates.length;
  const tooLarge = origN > maxTable;
  const next = new Map(); // "state|symbol" → state
  for (const t of dfaTrans) next.set(t.from + "|" + t.sym, t.to);

  // Complete the DFA: add implicit dead state at index origN if any
  // state is missing a transition on any alphabet symbol.
  const deadNeeded = dfaStates.some((_, s) => alpha.some((a) => !next.has(s + "|" + a)));
  const n = deadNeeded ? origN + 1 : origN;
  const DEAD = deadNeeded ? origN : -1;

  const isAcc = (s) => s !== DEAD && dfaAccepts.has(s);
  const delta = (s, a) => {
    if (s === DEAD) return DEAD;
    const t = next.get(s + "|" + a);
    return t !== undefined ? t : deadNeeded ? DEAD : undefined;
  };
  const pairKey = (a, b) => (a < b ? a + "," + b : b + "," + a);

  const marked = new Set();
  const witness = new Map(); // pair → a string that tells the two states apart
  const steps = [];
  const record = (st) => { if (!tooLarge) steps.push(st); };

  // Too large for a pair table: the classes by Moore's partition refinement, which is what the table computes at
  // O(n |Σ|) per round (no pairs, no witnesses).
  let block = null;
  if (tooLarge) {
    block = Array.from({ length: n }, (_, s) => (isAcc(s) ? 1 : 0));
    for (let again = true; again; ) {
      const ids = new Map();
      const nextBlock = block.map((b, s) => {
        const sig = b + "|" + alpha.map((a) => { const d = delta(s, a); return d === undefined ? -1 : block[d]; }).join(",");
        if (!ids.has(sig)) ids.set(sig, ids.size);
        return ids.get(sig);
      });
      again = new Set(nextBlock).size !== new Set(block).size;
      block = nextBlock;
    }
  }

  // ── Base case: mark all (accepting, non-accepting) pairs ──
  for (let i = 0; i < n && !tooLarge; i++) {
    for (let j = i + 1; j < n; j++) {
      if (isAcc(i) !== isAcc(j)) {
        marked.add(pairKey(i, j));
        witness.set(pairKey(i, j), "");
        record({ type: "mark-base", markedSnapshot: new Set(marked), activePair: [i, j], witness: "" });
      }
    }
  }

  // ── Refinement: propagate distinguishability ──
  let pass = 0;
  let changed = !tooLarge;
  while (changed) {
    changed = false;
    pass++;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (marked.has(pairKey(i, j))) continue;
        for (const a of alpha) {
          const di = delta(i, a);
          const dj = delta(j, a);
          if (di === dj) continue;
          if (di === undefined || dj === undefined) continue;
          if (marked.has(pairKey(di, dj))) {
            const w = a + witness.get(pairKey(di, dj));
            marked.add(pairKey(i, j));
            witness.set(pairKey(i, j), w);
            changed = true;
            record({ type: "mark-refine", markedSnapshot: new Set(marked), activePair: [i, j], pass, sym: a, di, dj, witness: w });
            break;
          }
        }
      }
    }
    if (!changed) record({ type: "no-change", markedSnapshot: new Set(marked), activePair: null, pass });
  }

  // ── Build equivalence classes via union-find ──
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
  function unite(x, y) { parent[find(x)] = find(y); }

  if (tooLarge) { const first = new Map(); for (let i = 0; i < n; i++) { if (first.has(block[i])) unite(i, first.get(block[i])); else first.set(block[i], i); } }
  else for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (!marked.has(pairKey(i, j))) unite(i, j);

  // Groups over original states only (exclude dead state ∅)
  const repToGroup = {};
  const groups = [];
  for (let i = 0; i < origN; i++) {
    const rep = find(i);
    if (repToGroup[rep] === undefined) {
      repToGroup[rep] = groups.length;
      groups.push([]);
    }
    groups[repToGroup[rep]].push(i);
  }

  // Equiv pairs for final display (original states only)
  const equivPairs = new Set();
  for (let i = 0; i < origN && !tooLarge; i++)
    for (let j = i + 1; j < origN; j++)
      if (!marked.has(pairKey(i, j))) equivPairs.add(pairKey(i, j));

  const alreadyMinimal = groups.length === origN;
  steps.push({ type: "result", markedSnapshot: new Set(marked), equivPairs, activePair: null, groups, origN, alreadyMinimal, tooLarge });

  // ── Build minimized DFA ──
  const minN = groups.length;
  const minStart = repToGroup[find(0)];

  const minAccepts = new Set();
  for (let i = 0; i < origN; i++) if (dfaAccepts.has(i)) minAccepts.add(repToGroup[find(i)]);

  const minTransSet = new Set();
  const minTrans = [];
  for (let i = 0; i < origN; i++) {
    for (const a of alpha) {
      const tt = next.get(i + "|" + a);
      if (tt !== undefined) {
        const from = repToGroup[find(i)];
        const to = repToGroup[find(tt)];
        const k = from + "," + a + "," + to;
        if (!minTransSet.has(k)) {
          minTransSet.add(k);
          minTrans.push({ from, sym: a, to });
        }
      }
    }
  }

  // Renumber so start state = 0 (BFS order from minStart)
  const renumMap = new Array(minN).fill(-1);
  let newIdx = 0;
  renumMap[minStart] = newIdx++;
  const bfsQ = [minStart];
  while (bfsQ.length) {
    const s = bfsQ.shift();
    for (const a of alpha) {
      const tx = minTrans.find((t) => t.from === s && t.sym === a);
      if (tx && renumMap[tx.to] === -1) {
        renumMap[tx.to] = newIdx++;
        bfsQ.push(tx.to);
      }
    }
  }
  for (let i = 0; i < minN; i++) if (renumMap[i] === -1) renumMap[i] = newIdx++;

  return {
    // dummy sets: renderers only need dfaStates.length
    dfaStates: Array.from({ length: minN }, () => new Set()),
    dfaAccepts: new Set([...minAccepts].map((i) => renumMap[i])),
    dfaTrans: minTrans.map((t) => ({ from: renumMap[t.from], sym: t.sym, to: renumMap[t.to] })),
    alpha,
    steps,
    groups,
    origN,
    n,
    DEAD,
    origScData: scData,
    renumMap,
    alreadyMinimal,
    tooLarge,
    witness,
  };
}

// ── DFA helpers ───────────────────────────────────────────────────────

// Run a DFA on a string. state is -1 once a missing transition is hit.
function dfaRun(dfa, input) {
  let state = 0;
  for (const a of [...input]) {
    const tx = dfa.dfaTrans.find((t) => t.from === state && t.sym === a);
    if (tx === undefined) return { state: -1, accepted: false };
    state = tx.to;
  }
  return { state, accepted: dfa.dfaAccepts.has(state) };
}

// The first accepted strings in shortlex order (shortest first, equal lengths in alphabet order): at most maxCount,
// none longer than maxLen. Only states from which an accepting state can be reached are explored.
function generateExamples(dfa, maxLen = 7, maxCount = 12) {
  const { dfaAccepts, dfaTrans, alpha } = dfa;
  const next = new Map();
  for (const t of dfaTrans) next.set(t.from + "|" + t.sym, t.to);
  // states that can reach an accepting state
  const live = new Set(dfaAccepts);
  for (let grew = true; grew; ) {
    grew = false;
    for (const t of dfaTrans) if (live.has(t.to) && !live.has(t.from)) { live.add(t.from); grew = true; }
  }
  const results = [];
  if (!live.has(0)) return results;
  const queue = [[0, ""]];
  for (let head = 0, steps = 0; head < queue.length && results.length < maxCount && steps < 50000; head++, steps++) {
    const [state, str] = queue[head];
    if (dfaAccepts.has(state)) results.push(str);
    if ([...str].length >= maxLen) continue;
    for (const a of alpha) {
      const to = next.get(state + "|" + a);
      if (to !== undefined && live.has(to)) queue.push([to, str + a]);
    }
  }
  return results;
}
