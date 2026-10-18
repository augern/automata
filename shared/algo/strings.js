// Random input strings for the simulation panels. Pure: every function takes
// `rng`, a function returning a number in [0, 1), so results can be tested.

function strPick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

// A random word over `alphabet`, minLen..maxLen symbols long.
function strRandomWord(alphabet, rng, maxLen = 8, minLen = 0) {
  if (!alphabet.length) return "";
  const n = minLen + Math.floor(rng() * (maxLen - minLen + 1));
  let s = "";
  for (let i = 0; i < n; i++) s += strPick(alphabet, rng);
  return s;
}

// Random walk through an automaton graph that ends in an accepting state.
// edges: [{ from, to, sym }] with sym "" or "ε" for ε-moves; states are any
// comparable values. Only moves that can still reach an accepting state are
// taken, so a walk never gets stuck. Returns a string, or null if no state
// accepts. At an accepting state the walk stops with probability stopP.
function strWalkAccepted(edges, start, accepting, rng, { stopP = 0.3, maxLen = 10, tries = 40 } = {}) {
  const accept = new Set(accepting);
  const live = new Set(accept);
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of edges) if (live.has(e.to) && !live.has(e.from)) { live.add(e.from); changed = true; }
  }
  if (!live.has(start)) return null;
  const out = new Map();
  for (const e of edges) if (live.has(e.to)) (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e);
  for (let t = 0; t < tries; t++) {
    let state = start, str = "";
    for (let step = 0; step < 4 * maxLen + 8; step++) {
      const moves = out.get(state) || [];
      if (accept.has(state) && (!moves.length || rng() < stopP)) return str;
      if (!moves.length) break;
      // Past the length budget, stop wandering: only stop or keep going via ε.
      const usable = str.length >= maxLen ? moves.filter((m) => m.sym === "" || m.sym === "ε") : moves;
      if (!usable.length) break;
      const e = strPick(usable, rng);
      if (e.sym !== "" && e.sym !== "ε") str += e.sym;
      state = e.to;
    }
  }
  return null;
}

// Rejection sampling for machines without a graph to walk (PDA, TM): random
// words, keeping one that `accepts` takes. Falls back to the last word tried
// (accepted: false) so there is always something to run. The empty word is only
// tried after a number of non-empty ones, so it is not the usual answer.
function strSampleAccepted(alphabet, accepts, rng, { maxLen = 8, tries = 300 } = {}) {
  let word = "";
  for (let i = 0; i < tries; i++) {
    word = strRandomWord(alphabet, rng, maxLen, i < tries * 0.8 ? 1 : 0);
    if (accepts(word)) return { value: word, accepted: true };
  }
  return { value: word, accepted: false };
}

// A random sentence of a context-free grammar { rules:[{lhs,rhs[]}], nonterminals:Set,
// start }, as an array of terminals; null if the grammar derives nothing.
// Early on it prefers rules that keep nonterminals (so sentences are not
// trivial); once enough terminals exist it prefers terminating rules.
function grammarRandomSentence(grammar, rng, { minTerms = 4, maxTerms = 12, attempts = 40 } = {}) {
  const { rules, nonterminals: nts } = grammar;
  // Shortest terminal expansion of each nonterminal (finishes a form quickly).
  function shortest(sym, seen) {
    if (!nts.has(sym)) return [sym];
    if (seen.has(sym)) return null;
    seen.add(sym);
    let best = null;
    for (const r of rules.filter((r) => r.lhs === sym)) {
      let res = [], ok = true;
      for (const s of r.rhs) {
        const sub = shortest(s, new Set(seen));
        if (!sub) { ok = false; break; }
        res = res.concat(sub);
      }
      if (ok && (!best || res.length < best.length)) best = res;
    }
    return best;
  }
  const base = {};
  for (const nt of nts) base[nt] = shortest(nt, new Set()) || [];
  const finish = (form) => form.flatMap((s) => (nts.has(s) ? base[s] : [s]));

  function expand() {
    let form = [grammar.start];
    for (let step = 0; step < 60; step++) {
      const open = form.map((s, i) => (nts.has(s) ? i : -1)).filter((i) => i !== -1);
      if (!open.length) break;
      const terms = form.filter((s) => !nts.has(s)).length;
      if (terms >= maxTerms) return finish(form);
      const pos = open[Math.floor(rng() * Math.min(2, open.length))];
      const cands = rules.filter((r) => r.lhs === form[pos]);
      if (!cands.length) break;
      let chosen;
      if (terms < minTerms) {
        const rec = cands.filter((r) => r.rhs.some((s) => nts.has(s)));
        chosen = strPick(rec.length ? rec : cands, rng);
      } else {
        const done = cands.filter((r) => r.rhs.every((s) => !nts.has(s)));
        chosen = done.length && rng() < 0.55 ? strPick(done, rng) : strPick(cands, rng);
      }
      form.splice(pos, 1, ...chosen.rhs);
      if (form.length > maxTerms * 3) return finish(form);
    }
    return finish(form);
  }

  let best = null;
  for (let t = 0; t < attempts; t++) {
    const cand = expand().filter((s) => s.length);
    if (!cand.length) continue;
    if (!best) { best = cand; continue; }
    const ok = cand.length >= minTerms && cand.length <= maxTerms;
    const bestOk = best.length >= minTerms && best.length <= maxTerms;
    if (ok && (!bestOk || cand.length > best.length)) best = cand;
  }
  return best;
}

// Input string to tokens: separated by whitespace when it has any; without whitespace the string is cut
// greedily at the grammar's terminals (longest first, any other character on its own), so "aab", "id+id" and
// "(a|b)*" all work with no spaces. The grammar tools' one tokeniser.
function strTokenise(terminals, str) {
  const s = String(str).trim();
  if (!s) return [];
  if (/\s/.test(s)) return s.split(/\s+/);
  const terms = [...terminals].filter((t) => t !== "$").sort((a, b) => b.length - a.length);
  const out = [];
  let at = 0;
  while (at < s.length) {
    const t = terms.find((x) => x && s.startsWith(x, at));
    const piece = t || s[at];
    out.push(piece);
    at += piece.length;
  }
  return out;
}
