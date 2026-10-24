// The scanner's DFA as a graph, with the scanner's position marked on it. Used by the Scanner tool and the Compiler Front End.
// Needs d3, dagre, fit-view.js, automaton-graph.js, algo/scanner.js and shared.js.
//
//   const g = ScannerGraph.create({ prefix, noteId, getSc, getView, onClasses })
//     prefix    the page has <svg id="P-svg"><g id="P-graph-root"></g></svg> (see automaton-graph.js)
//     noteId    an element for a note about the part of the DFA that is drawn
//     getSc()   the compiled scanner (algo/scanner.js scnCompile), or null
//     getView() where the scanner is now: { state, path, edges, last, from, ch, taken } or null
//                 state: the DFA state it is in; path, edges: the states and transitions taken in this call; last: the
//                 last accepting state seen { state }; from: the state it reads from next; ch: the next character;
//                 taken: { a, b, cls } the transition just taken
//     onClasses(ids | null)   the character classes under the pointer (the tool may mark them elsewhere)
//   g.draw()  the graph (again); g.mark()  the position on it; g.menu()  the items of its panel menu;
//   g.hotClass(c)  mark the edges of character class c; g.view  the graph view (fit)
//
// A real scanner's DFA is too big to read as one picture, so above DFA_BIG states it shows a part: the path so far, the
// current state, the last accepting state, and where the next character leads. A label that is short is on its edge; a
// long one is ⋯ and is in the tooltip of the edge (several lines: the classes with their members), as the state's
// tooltip says what it accepts and where it leads.
const ScannerGraph = (() => {
  const DFA_BIG = 30, SHORT_LABEL = 8;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const indexOf = (n, keep) => new Map((keep ? [...keep].sort((a, b) => a - b) : Array.from({ length: n }, (_, i) => i)).map((s, k) => [s, k]));

  // ── The tooltip: one for the page ──
  let tipEl = null, tipX = 0, tipY = 0;
  function showTip(html) {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "sc-tip";
      document.body.appendChild(tipEl);
    }
    tipEl.innerHTML = html;
    tipEl.style.display = "block";
    placeTip();
  }
  function placeTip() {
    if (!tipEl || tipEl.style.display === "none") return;
    const r = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.max(4, Math.min(tipX + 14, window.innerWidth - r.width - 8)) + "px";
    tipEl.style.top = Math.max(4, Math.min(tipY + 16, window.innerHeight - r.height - 8)) + "px";
  }
  function hideTip() { if (tipEl) tipEl.style.display = "none"; }
  document.addEventListener("mousemove", (e) => { tipX = e.clientX; tipY = e.clientY; placeTip(); });

  // Notes for the rows of the token rules: a rule that never matches, and the rules that lose to earlier ones.
  // [{ rule, kind, text }] for the scanner editor's flag().
  function notes(sc) {
    const out = [];
    if (!sc) return out;
    const live = sc.rules;
    for (const k of sc.shadowed) {
      const by = live.map((r, j) => j).filter((j) => j < k && sc.dfa.states.some((s) => s.accept === j && s.rules.includes(k)));
      out.push({ rule: k, kind: "warn", text: "Never matches: " + (by.length ? by.map((j) => live[j].name).join(", ") + " is earlier and accepts every lexeme this rule does." : "an earlier rule accepts everything it does.") });
    }
    // a rule that loses to earlier rules where they match the same lexeme: one note, the winners listed
    const beats = new Map();
    for (const st of sc.dfa.states) {
      if (st.rules.length < 2) continue;
      for (const l of st.rules.slice(1)) {
        if (sc.shadowed.includes(l)) continue;
        if (!beats.has(l)) beats.set(l, new Set());
        beats.get(l).add(st.rules[0]);
      }
    }
    for (const [l, ws] of beats) {
      const names = [...ws].sort((x, y) => x - y).map((w) => live[w].name);
      out.push({ rule: l, kind: "info", text: "Where it matches the same lexeme as " + names.join(", ") + ", the earlier rule wins." });
    }
    return out;
  }

  function create(o) {
    const P = o.prefix;
    let mode = "auto", ix = new Map(), ids = [], classIds = new Map();
    const view = createGraphView(P, { hasNodes: () => !!o.getSc(), onRelayout: () => { draw(); mark(); } });
    const focus = () => { const sc = o.getSc(); return !!sc && (mode === "focus" || (mode === "auto" && sc.dfa.states.length > DFA_BIG)); };

    // the states of the DFA that are drawn in the part view
    function shown() {
      if (!focus()) return null;
      const { dfa } = o.getSc(), v = o.getView() || {};
      const cur = v.state !== null && v.state !== undefined ? v.state : 0;
      const keep = new Set([0, cur]);
      for (const s of v.path || []) keep.add(s);
      if (v.last) keep.add(v.last.state);
      const from = v.from || 0;
      const succ = dfa.trans[from].filter((t) => t >= 0);
      if (new Set(succ).size <= 8) succ.forEach((t) => keep.add(t));
      if (v.ch !== undefined) { const t = dfa.trans[from][dfa.classOf(v.ch)]; if (t >= 0) keep.add(t); }
      return keep;
    }

    function draw() {
      const sc = o.getSc(), note = document.getElementById(o.noteId);
      if (!sc) { drawAutomatonGraph(P, view, { nodes: [], start: 0, edges: [] }); if (note) note.textContent = ""; return; }
      const { dfa, rules } = sc;
      const keep = shown();
      ix = indexOf(dfa.states.length, keep);
      if (note) note.textContent = keep ? dfa.states.length + " states in all: the part around the current state." : "";
      const dp = new Map(), loops = new Map();
      classIds = new Map();
      dfa.trans.forEach((row, from) => row.forEach((to, c) => {
        if (to < 0 || !ix.has(from) || !ix.has(to)) return;
        const m = from === to ? loops : dp, key = from + ">" + to;
        if (!m.has(key)) m.set(key, { from: ix.get(from), to: ix.get(to), node: ix.get(from), labels: [], ids: [] });
        const id = ix.get(from) + ":" + ix.get(to) + ":" + c; // one id for each class on each edge
        m.get(key).labels.push(dfa.classes[c].label);
        m.get(key).ids.push(id);
        if (!classIds.has(c)) classIds.set(c, []);
        classIds.get(c).push(id);
      }));
      // a label that is short is drawn on its edge; a long one is left out (⋯) and is in the tooltip
      for (const e of [...dp.values(), ...loops.values()]) if (e.labels.join(", ").length > SHORT_LABEL) e.labels = [AG_MORE];
      ids = [...ix.keys()];
      drawAutomatonGraph(P, view, {
        nodes: ids.map((i) => { const st = dfa.states[i]; return { label: String(st.id), accepting: st.accept >= 0, tag: st.accept >= 0 ? rules[st.accept].name : undefined }; }),
        start: ix.get(0),
        edges: [...dp.values()],
        loops: [...loops.values()],
        joinLabels: true,
        reserveLabels: true,
        onHover: (hot) => {
          if (o.onClasses) o.onClasses(hot ? hot.map((id) => +id.split(":")[2]) : null);
          if (hot) { setGraphHot(P, hot); showTip(edgeTip(hot)); } else { taken(); hideTip(); }
        },
        onNodeHover: (i) => { setGraphNodeHot(P, i); if (i !== null) showTip(stateTip(ids[i])); else hideTip(); },
      });
      ids.forEach((i) => { const st = dfa.states[i]; if (st.rules.length) d3.select("#" + P + "-state-" + ix.get(i)).attr("data-tok", st.rules.map((r) => r + 1).join(" ")); });
    }

    // The position: the state the scanner is in (blue), the path of this call (blue edges, orange states), the last
    // accepting state seen (green), the transition just taken.
    function mark() {
      const sc = o.getSc();
      if (focus() && sc) draw();
      const root = "#" + P + "-graph-root";
      const at = (s) => (ix.has(s) ? ix.get(s) : -1);
      d3.selectAll(root + " .ag-node").classed("is-hot", false).classed("is-last", false);
      d3.selectAll(root + " .ag-edge").classed("is-active", false);
      highlightAutomatonStates(P, []);
      const v = o.getView();
      if (!v || !sc) { setGraphHot(P, []); return; }
      for (const s of v.path || []) d3.select("#" + P + "-state-" + at(s)).classed("is-hot", true);
      for (const [a, b] of v.edges || []) {
        const x = at(a), y = at(b);
        if (x < 0 || y < 0) continue;
        d3.selectAll(root + ' [data-edge="' + x + "-" + y + '"], ' + root + ' [data-self="' + x + '"]').filter(function () { return x === y ? this.dataset.self !== undefined : this.dataset.edge !== undefined; }).classed("is-active", true);
      }
      if (v.last) d3.select("#" + P + "-state-" + at(v.last.state)).classed("is-last", true);
      taken();
      if (v.state !== null && v.state !== undefined) highlightAutomatonStates(P, [at(v.state)]);
    }

    // the transition just taken is marked (its class is in the log)
    function taken() {
      setGraphHot(P, []);
      const v = o.getView();
      if (!v || !v.taken || !ix.has(v.taken.a) || !ix.has(v.taken.b)) return;
      setGraphHot(P, [ix.get(v.taken.a) + ":" + ix.get(v.taken.b) + ":" + v.taken.cls]);
    }

    function classLine(c) {
      const k = o.getSc().dfa.classes[c];
      const named = k.chars.filter((x) => x !== SCN_OTHER);
      const list = named.length > 1 ? scnShowChars(named) : "";
      const what = (named.length ? named.length + " character" + (named.length === 1 ? "" : "s") + (list && list !== k.label.replace(/^\[|\]$/g, "") ? ": " + esc(list.length > 60 ? list.slice(0, 60) + "…" : list) : "") : "") + (k.chars.includes(SCN_OTHER) ? (named.length ? "; " : "") + "any character no rule mentions" : "");
      return "<div><b>" + esc(k.label) + "</b> <span>" + what + "</span></div>";
    }
    function edgeTip(hot) {
      const sc = o.getSc();
      const [a, b] = hot[0].split(":").map(Number);
      const from = ids[a], to = ids[b], st = sc.dfa.states[to];
      return '<div class="sc-tip-head">State ' + from + " → " + to + "</div>" + hot.map((id) => classLine(+id.split(":")[2])).join("") +
        (st.accept >= 0 ? "<div class='sc-tip-foot'>State " + to + " accepts " + esc(sc.rules[st.accept].name) + "</div>" : "");
    }
    function stateTip(id) {
      const { dfa, rules } = o.getSc(), st = dfa.states[id];
      let h = '<div class="sc-tip-head">State ' + id + (id === 0 ? " (start)" : "") + "</div>";
      if (st.accept >= 0) h += "<div>Accepts <b>" + esc(rules[st.accept].name) + "</b>" + (st.rules.length > 1 ? "; also matches " + st.rules.slice(1).map((r) => esc(rules[r].name)).join(", ") + ", which come later" : "") + "</div>";
      const out = new Map();
      dfa.trans[id].forEach((t, c) => { if (t >= 0) { if (!out.has(t)) out.set(t, []); out.get(t).push(dfa.classes[c].label); } });
      const rows = [...out].map(([t, cs]) => "<div>→ <b>" + t + "</b> <span>on " + esc(cs.join(", ")) + "</span></div>");
      h += rows.length ? rows.slice(0, 8).join("") + (rows.length > 8 ? "<div><span>… and " + (rows.length - 8) + " more states</span></div>" : "") : "<div><span>No transitions out</span></div>";
      return h;
    }

    const menu = () => [
      { heading: "DFA view" },
      { label: "Automatic", checked: mode === "auto", title: "The whole DFA up to " + DFA_BIG + " states, else the part around the current state", onSelect: () => { mode = "auto"; draw(); mark(); } },
      { label: "Whole DFA", checked: mode === "whole", onSelect: () => { mode = "whole"; draw(); mark(); } },
      { label: "Around the current state", checked: mode === "focus", title: "The states on the path so far, the current state and its successors", onSelect: () => { mode = "focus"; draw(); mark(); } },
    ];
    return {
      view, draw, mark, menu, hideTip,
      hotClass: (c) => setGraphHot(P, classIds.get(c) || []),
      unhot: taken,
    };
  }

  return { create, notes };
})();
