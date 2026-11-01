// Pure: nullable symbols, FIRST and FOLLOW as three recorded fixpoint iterations (needs algo/grammar.js).
// One event per rule application, in the order computeFirst and computeFollow apply them, so the final sets are theirs.
//   rec = { events, rounds, nullable, first, follow }
//   event: { phase: "nullable" | "first" | "follow", round, rule, pos, target, cells, end, added, viaFollow }
//     rule      index into g.rules (-1 for the seed of FOLLOW)
//     pos       FOLLOW: index in the right-hand side of the occurrence that receives the tokens
//     target    the nonterminal whose set grows
//     cells     the symbols read, left to right: { sym, state: "pass" | "stop" | "unread", toks }
//     end       the scan passed every symbol: the sequence is nullable
//     added     tokens new to the set (nullable: the nonterminal itself)
//     viaFollow FOLLOW: the part of added that came from FOLLOW of the left-hand side
//   round: { phase, round, from, to, added }; the last round of a phase adds nothing.

// Reads seq left to right while its symbols can derive ε. withToks: collect FIRST of each symbol read.
function ffScan(seq, nts, nullable, first, withToks) {
  const cells = [];
  const toks = new Set();
  let end = true;
  for (const sym of seq) {
    if (!end) { cells.push({ sym, state: "unread", toks: [] }); continue; }
    const own = withToks ? (nts.has(sym) ? [...first[sym]] : [sym]).sort() : [];
    const pass = nts.has(sym) && nullable.has(sym);
    cells.push({ sym, state: pass ? "pass" : "stop", toks: own });
    for (const t of own) toks.add(t);
    if (!pass) end = false;
  }
  return { cells, toks: [...toks].sort(), end };
}

function ffRecord(g) {
  const { rules, nonterminals: nts } = g;
  const nullable = new Set();
  const first = {}, follow = {};
  for (const nt of nts) { first[nt] = new Set(); follow[nt] = new Set(); }
  const events = [], rounds = [];

  const run = (phase, firstRound, body) => {
    for (let round = firstRound; ; round++) {
      const from = events.length;
      body(round);
      const added = events.slice(from).reduce((n, e) => n + e.added.length, 0);
      rounds.push({ phase, round, from, to: events.length, added });
      if (round > 0 && !added) break;
    }
  };

  run("nullable", 1, (round) => {
    rules.forEach((r, rule) => {
      const sc = ffScan(r.rhs, nts, nullable, first, false);
      const added = sc.end && !nullable.has(r.lhs) ? [r.lhs] : [];
      for (const a of added) nullable.add(a);
      events.push({ phase: "nullable", round, rule, target: r.lhs, cells: sc.cells, end: sc.end, added });
    });
  });

  run("first", 1, (round) => {
    rules.forEach((r, rule) => {
      const sc = ffScan(r.rhs, nts, nullable, first, true);
      const added = sc.toks.filter((t) => !first[r.lhs].has(t));
      for (const t of added) first[r.lhs].add(t);
      events.push({ phase: "first", round, rule, target: r.lhs, cells: sc.cells, end: sc.end, added });
    });
  });

  run("follow", 0, (round) => {
    if (round === 0) {
      follow[g.start].add("$");
      events.push({ phase: "follow", round, rule: -1, pos: -1, target: g.start, cells: [], end: false, added: ["$"], viaFollow: [] });
      return;
    }
    rules.forEach((r, rule) => {
      r.rhs.forEach((b, pos) => {
        if (!nts.has(b)) return;
        const sc = ffScan(r.rhs.slice(pos + 1), nts, nullable, first, true);
        const added = sc.toks.filter((t) => !follow[b].has(t));
        for (const t of added) follow[b].add(t);
        const viaFollow = [];
        if (sc.end) for (const t of [...follow[r.lhs]].sort()) if (!follow[b].has(t)) { follow[b].add(t); added.push(t); viaFollow.push(t); }
        events.push({ phase: "follow", round, rule, pos, target: b, cells: sc.cells, end: sc.end, added, viaFollow });
      });
    });
  });

  return { events, rounds, nullable, first, follow };
}

// The sets after the first upto + 1 events (upto = -1: all empty), and the event that put each member there:
//   { nullable: Set, first: { A: Set }, follow: { A: Set }, by: { nullable: { A: i }, first: { A: { t: i } }, follow: { A: { t: i } } } }
function ffStateAt(g, rec, upto) {
  const st = { nullable: new Set(), first: {}, follow: {}, by: { nullable: {}, first: {}, follow: {} } };
  for (const nt of g.nonterminals) { st.first[nt] = new Set(); st.follow[nt] = new Set(); st.by.first[nt] = {}; st.by.follow[nt] = {}; }
  for (let i = 0; i <= upto && i < rec.events.length; i++) {
    const e = rec.events[i];
    for (const t of e.added) {
      if (e.phase === "nullable") { st.nullable.add(t); st.by.nullable[t] = i; }
      else { st[e.phase][e.target].add(t); st.by[e.phase][e.target][t] = i; }
    }
  }
  return st;
}

const ffRule = (g, i) => `${g.rules[i].lhs} → ${g.rules[i].rhs.length ? g.rules[i].rhs.join(" ") : EPSILON}`;

// What the event does, in one sentence.
function ffExplain(g, ev) {
  if (ev.rule < 0) return `${g.start} is the start symbol: the end of the input can follow it`;
  const r = g.rules[ev.rule];
  const stop = ev.cells.find((c) => c.state === "stop");
  if (ev.phase === "nullable") {
    if (!r.rhs.length) return ev.added.length ? `${ffRule(g, ev.rule)} is empty: ${r.lhs} is nullable` : `${ffRule(g, ev.rule)} is empty; ${r.lhs} is already nullable`;
    if (ev.added.length) return `every symbol of ${ffRule(g, ev.rule)} is nullable: ${r.lhs} is nullable`;
    return ev.end ? `every symbol of ${ffRule(g, ev.rule)} is nullable; ${r.lhs} already is` : `${stop.sym} is not nullable: ${ffRule(g, ev.rule)} does not make ${r.lhs} nullable`;
  }
  if (ev.phase === "first") {
    if (!r.rhs.length) return `${ffRule(g, ev.rule)} is empty: it adds nothing to FIRST(${r.lhs}); ε is the nullable mark`;
    if (ev.end) return `every symbol of ${ffRule(g, ev.rule)} can derive ε: the FIRST sets of all of them count`;
    const k = ev.cells.indexOf(stop);
    return k === 0 ? `${stop.sym} comes first${g.nonterminals.has(stop.sym) ? " and cannot derive ε: only its FIRST set counts" : " and is a terminal"}`
      : `${ev.cells.slice(0, k).map((c) => c.sym).join(" ")} can derive ε, so the scan goes on to ${stop.sym}, which cannot: it stops there`;
  }
  const rest = r.rhs.slice(ev.pos + 1);
  const head = `${g.rules[ev.rule].rhs[ev.pos]} in ${ffRule(g, ev.rule)}`;
  if (!rest.length) return `${head} is last: FOLLOW(${r.lhs}) flows into FOLLOW(${ev.target})`;
  return `after ${head} comes ${rest.join(" ")}: its FIRST goes into FOLLOW(${ev.target})` + (ev.end ? `; it can be empty, so FOLLOW(${r.lhs}) flows in too` : `; it stops at ${stop.sym}, which is not nullable`);
}
