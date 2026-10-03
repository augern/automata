// Pure LR algorithms: LR(0)/LR(1) item-set automata, LALR(1) merging, and
// ACTION/GOTO table construction. No DOM access. Depends on grammar.js
// (EPSILON, firstOfSeq, computeFirst, computeFollow).

// ── LR(0) ─────────────────────────────────────────────────────────────
function ik0(i) {
  return i.rule + ":" + i.dot;
}
function ik1(i) {
  return i.rule + ":" + i.dot + ":" + i.lookahead;
}
function closure0(items, rules, nts) {
  const set = new Map(items.map((i) => [ik0(i), i])),
    q = [...items];
  while (q.length) {
    const it = q.shift(),
      sym = rules[it.rule].rhs[it.dot];
    if (!sym || !nts.has(sym)) continue;
    for (let ri = 0; ri < rules.length; ri++) {
      if (rules[ri].lhs !== sym) continue;
      const ni = { rule: ri, dot: 0 },
        k = ik0(ni);
      if (!set.has(k)) {
        set.set(k, ni);
        q.push(ni);
      }
    }
  }
  return [...set.values()];
}
function buildLR0(g) {
  const { rules, nonterminals: nts } = g,
    init = closure0([{ rule: 0, dot: 0 }], rules, nts);
  const sm = new Map(),
    states = [],
    edges = [];
  function goa(items) {
    const key = items.map(ik0).sort().join("|");
    if (sm.has(key)) return sm.get(key);
    const id = states.length,
      acc = items.some((i) => rules[i.rule].lhs === g.start && i.dot === rules[i.rule].rhs.length);
    states.push({ id, items, accepting: acc, kernel: id !== 0 });
    sm.set(key, id);
    return id;
  }
  goa(init);
  for (let i = 0; i < states.length; i++) {
    const syms = new Set(states[i].items.map((it) => rules[it.rule].rhs[it.dot]).filter(Boolean));
    for (const sym of syms) {
      const mv = states[i].items.filter((it) => rules[it.rule].rhs[it.dot] === sym).map((it) => ({ rule: it.rule, dot: it.dot + 1 }));
      const nx = mv.length ? closure0(mv, rules, nts) : [];
      if (nx.length) edges.push({ s: i, t: goa(nx), label: sym });
    }
  }
  return { states, edges };
}

// ── LR(1) ─────────────────────────────────────────────────────────────
function closure1(items, rules, nts, first) {
  const set = new Map(items.map((i) => [ik1(i), i])),
    q = [...items];
  while (q.length) {
    const it = q.shift(),
      rule = rules[it.rule],
      sym = rule.rhs[it.dot];
    if (!sym || !nts.has(sym)) continue;
    const la = firstOfSeq(rule.rhs.slice(it.dot + 1).concat([it.lookahead]), first);
    for (let ri = 0; ri < rules.length; ri++) {
      if (rules[ri].lhs !== sym) continue;
      for (const a of la) {
        if (a === EPSILON) continue;
        const ni = { rule: ri, dot: 0, lookahead: a },
          k = ik1(ni);
        if (!set.has(k)) {
          set.set(k, ni);
          q.push(ni);
        }
      }
    }
  }
  return [...set.values()];
}
function buildLR1(g) {
  const { rules, nonterminals: nts } = g,
    first = computeFirst(g);
  const init = closure1([{ rule: 0, dot: 0, lookahead: "$" }], rules, nts, first);
  const sm = new Map(),
    states = [],
    edges = [];
  function goa(items) {
    const key = items.map(ik1).sort().join("|");
    if (sm.has(key)) return sm.get(key);
    const id = states.length,
      acc = items.some((i) => rules[i.rule].lhs === g.start && i.dot === rules[i.rule].rhs.length);
    states.push({ id, items, accepting: acc, kernel: id !== 0 });
    sm.set(key, id);
    return id;
  }
  goa(init);
  for (let i = 0; i < states.length; i++) {
    const syms = new Set(states[i].items.map((it) => rules[it.rule].rhs[it.dot]).filter(Boolean));
    for (const sym of syms) {
      const mv = states[i].items.filter((it) => rules[it.rule].rhs[it.dot] === sym).map((it) => ({ rule: it.rule, dot: it.dot + 1, lookahead: it.lookahead }));
      const nx = mv.length ? closure1(mv, rules, nts, first) : [];
      if (nx.length) edges.push({ s: i, t: goa(nx), label: sym });
    }
  }
  return { states, edges };
}

// ── LALR(1) ───────────────────────────────────────────────────────────
function mergeLR1toLALR(lr1) {
  const { states, edges } = lr1,
    ck = (it) => it.rule + ":" + it.dot;
  const cg = new Map();
  for (const s of states) {
    // Unique cores only: an LR(1) state repeats a core once per lookahead.
    const k = [...new Set(s.items.map(ck))].sort().join("|");
    if (!cg.has(k)) cg.set(k, []);
    cg.get(k).push(s.id);
  }
  const lm = new Map(),
    ms = [];
  const groups = [...cg.values()].sort((a, b) => Math.min(...a) - Math.min(...b));
  groups.forEach((g, mid) => {
    const im = new Map();
    for (const sid of g)
      for (const it of states[sid].items) {
        const k = ck(it);
        if (!im.has(k)) im.set(k, { rule: it.rule, dot: it.dot, la: new Set() });
        im.get(k).la.add(it.lookahead);
      }
    ms.push({
      id: mid,
      kernel: mid !== 0,
      accepting: states[Math.min(...g)].accepting,
      items: [...im.values()].map(({ rule, dot, la }) => ({ rule, dot, lookahead: [...la].sort().join(",") })),
    });
    for (const sid of g) lm.set(sid, mid);
  });
  const es = new Set(),
    me = [];
  for (const { s, t, label } of edges) {
    const ms2 = lm.get(s),
      mt = lm.get(t),
      k = ms2 + "\u2192" + mt + ":" + label;
    if (!es.has(k)) {
      es.add(k);
      me.push({ s: ms2, t: mt, label });
    }
  }
  return { states: ms, edges: me };
}

// ── Table construction ────────────────────────────────────────────────
function buildTables(g, auto, mode) {
  const { rules, nonterminals: nts, terminals: terms, start } = g,
    { states, edges } = auto;
  const action = states.map(() => ({})),
    gt = states.map(() => ({})),
    conflicts = [];
  const follow = mode === "SLR1" ? computeFollow(g, computeFirst(g)) : null;
  function add(s, sym, entry) {
    const cur = action[s][sym];
    if (cur === undefined) {
      action[s][sym] = entry;
    } else if (cur !== entry) {
      const ex = Array.isArray(cur) ? cur : [cur];
      if (!ex.includes(entry)) {
        const m = [...ex, entry];
        action[s][sym] = m;
        const existing = conflicts.find((c) => c.state === s && c.symbol === sym);
        if (existing) existing.entries = m;
        else conflicts.push({ state: s, symbol: sym, entries: m });
      }
    }
  }
  for (const { s, t, label } of edges) nts.has(label) ? (gt[s][label] = t) : add(s, label, "s" + t);
  for (const state of states)
    for (const item of state.items) {
      const rule = rules[item.rule];
      if (item.dot < rule.rhs.length) continue;
      if (rule.lhs === start) {
        add(state.id, "$", "acc");
      } else if (mode === "LR1") {
        for (const la of item.lookahead.split(",")) add(state.id, la.trim(), "r" + item.rule);
      } else if (mode === "SLR1") {
        for (const t of follow[rule.lhs] || new Set()) add(state.id, t, "r" + item.rule);
      } else {
        for (const t of terms) add(state.id, t, "r" + item.rule);
      }
    }
  return { action, goto: gt, conflicts };
}
