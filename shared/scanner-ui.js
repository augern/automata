// The view of the scanner tool. A page has the panels p-rules (the token rules, in the scanner editor), p-nfa (the NFA of all
// rules and the character classes), p-dfa (the minimal DFA and its transition table) and p-run (the input, the stepper,
// the tokens returned); ScannerTool.init(cfg) wires them to the engine in algo/scanner.js. Needs d3, dagre, shared.js,
// ui.js, stepper.js, fit-view.js, automaton-graph.js and the scanner editor.
//   cfg.examples   the url of the tool's examples.json
//   cfg.storage    the key of the panel layout in localStorage
const ScannerTool = (() => {
  let sc = null, run = null, strings = [], cfg = null, sim = null, editor = null, nfaView = null, dfaView = null;
  let fine = false, frames = []; // frames: the ones the stepper walks (coarse: without the one-character frames)
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function setError(msg) { $("error-msg").textContent = msg || ""; }

  // ── Building ──────────────────────────────────────────────
  function build() {
    sc = null;
    try {
      sc = scnCompile($("token-input").value);
      setError("");
    } catch (e) {
      setError(e.message);
    }
    saveShare();
    drawGraphs();
    drawClasses();
    drawTable();
    flagRules();
    runString();
  }

  // Notes under the rules: a rule that never matches, and the rules that a state accepts together.
  function flagRules() {
    if (!editor) return;
    const notes = [];
    if (sc) {
      const live = sc.rules;
      for (const k of sc.shadowed) {
        const by = live.map((r, j) => j).filter((j) => j < k && sc.dfa.states.some((s) => s.accept === j && s.rules.includes(k)));
        notes.push({ rule: k, kind: "warn", text: "Never matches: " + (by.length ? by.map((j) => live[j].name).join(", ") + " is earlier and accepts every lexeme this rule does." : "an earlier rule accepts everything it does.") });
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
        notes.push({ rule: l, kind: "info", text: "Where it matches the same lexeme as " + names.join(", ") + ", the earlier rule wins." });
      }
    }
    editor.flag(notes);
  }

  // ── The graphs ────────────────────────────────────────────
  // A real scanner's automata are too big to read as one picture, so above a size they show a part: the NFA of one rule
  // (the one pointed at in the rules), the DFA around the state the scanner is in. The panel menus choose.
  const NFA_BIG = 40, DFA_BIG = 30, SHORT_LABEL = 8;
  let nfaMode = "auto", dfaMode = "auto", nfaRule = 0;
  const nfaOne = () => !!sc && (nfaMode === "rule" || (nfaMode === "auto" && sc.nfa.n > NFA_BIG));
  const dfaFocus = () => !!sc && (dfaMode === "focus" || (dfaMode === "auto" && sc.dfa.states.length > DFA_BIG));
  let nfaIx = new Map(), dfaIx = new Map(); // state → its index in what is drawn
  let dfaIds = []; // the states drawn, by their index in the drawing
  let classIds = new Map(); // character class → the ids of its labels on the DFA edges
  panelMenuExtras["p-nfa"] = () => [
    { heading: "NFA view" },
    { label: "Automatic", checked: nfaMode === "auto", title: "All rules up to " + NFA_BIG + " states, else one rule", onSelect: () => { nfaMode = "auto"; drawNfa(); } },
    { label: "All rules", checked: nfaMode === "whole", onSelect: () => { nfaMode = "whole"; drawNfa(); } },
    { label: "One rule", checked: nfaMode === "rule", title: "The NFA of the rule pointed at in the token rules", onSelect: () => { nfaMode = "rule"; drawNfa(); } },
    { separator: true },
    { label: "Character classes", checked: shown.classes, onSelect: () => { shown.classes = !shown.classes; applySections(); } },
  ];
  panelMenuExtras["p-dfa"] = () => [
    { heading: "DFA view" },
    { label: "Automatic", checked: dfaMode === "auto", title: "The whole DFA up to " + DFA_BIG + " states, else the part around the current state", onSelect: () => { dfaMode = "auto"; drawDfa(); } },
    { label: "Whole DFA", checked: dfaMode === "whole", onSelect: () => { dfaMode = "whole"; drawDfa(); } },
    { label: "Around the current state", checked: dfaMode === "focus", title: "The states on the path so far, the current state and its successors", onSelect: () => { dfaMode = "focus"; drawDfa(); } },
    { separator: true },
    { label: "Transition table", checked: shown.table, onSelect: () => { shown.table = !shown.table; applySections(); } },
  ];

  // The character classes and the transition table are kept, but off unless the panel menu shows them.
  const shown = { classes: false, table: false };
  function applySections() {
    $("p-nfa").querySelector(".sc-section").hidden = !shown.classes;
    $("p-dfa").querySelector(".sc-section").hidden = !shown.table;
    if (nfaView) nfaView.fit();
    if (dfaView) dfaView.fit();
  }
  function drawGraphs() {
    drawNfa();
    drawDfa();
  }

  // The states `keep` (all when null) of an automaton with the edges between them: the indexes they are drawn by.
  const indexOf = (n, keep) => new Map((keep ? [...keep].sort((a, b) => a - b) : Array.from({ length: n }, (_, i) => i)).map((s, k) => [s, k]));

  function drawNfa() {
    const note = $("nfa-note");
    if (!sc) { drawAutomatonGraph("nfa", nfaView, { nodes: [], start: 0, edges: [] }); note.textContent = ""; return; }
    const { nfa, rules } = sc;
    let keep = null;
    if (nfaOne()) {
      // the states that lead to the accepting state of the rule, and the start state
      const acc = [...nfa.accept].find(([, k]) => k === nfaRule);
      keep = new Set([0]);
      if (acc) {
        const todo = [acc[0]];
        keep.add(acc[0]);
        while (todo.length) {
          const t = todo.pop();
          for (const e of nfa.edges) if (e.to === t && !keep.has(e.from)) { keep.add(e.from); if (e.from !== 0) todo.push(e.from); }
        }
      }
      note.textContent = nfa.n + " states in all: the rule " + rules[nfaRule].name + ". Point at another rule.";
    } else note.textContent = "";
    nfaIx = indexOf(nfa.n, keep);
    const ids = [...nfaIx.keys()];
    const pairs = new Map();
    for (const e of nfa.edges) {
      if (!nfaIx.has(e.from) || !nfaIx.has(e.to)) continue;
      const key = e.from + ">" + e.to;
      if (!pairs.has(key)) pairs.set(key, { from: nfaIx.get(e.from), to: nfaIx.get(e.to), labels: [], eps: true });
      const p = pairs.get(key);
      p.labels.push(e.set ? scnSetLabel(e.set) : "ε");
      if (e.set) p.eps = false;
    }
    drawAutomatonGraph("nfa", nfaView, {
      nodes: ids.map((i) => ({ label: String(i), accepting: nfa.accept.has(i), tag: nfa.accept.has(i) ? rules[nfa.accept.get(i)].name : undefined })),
      start: nfaIx.get(0),
      edges: [...pairs.values()],
      joinLabels: true,
      reserveLabels: ids.length <= NFA_BIG,
      hideEps: true,
      radius: 13,
    });
    nfa.accept.forEach((k, s) => { if (nfaIx.has(s)) d3.select("#nfa-state-" + nfaIx.get(s)).attr("data-prod", k + 1); });
  }

  // The states of the DFA that are drawn in the part view: the path so far, the current state, the last accepting state,
  // and where the scanner goes next: the successor on the next character, and all of them when there are few.
  function dfaShown() {
    if (!dfaFocus()) return null;
    const { dfa } = sc, f = currentFrame();
    const cur = f && f.state !== null && f.state !== undefined ? f.state : 0;
    const keep = new Set([0, cur]);
    for (const s of (f && f.path) || []) keep.add(s);
    if (f && f.last) keep.add(f.last.state);
    // the state the scanner reads from next: the one it is in, or the start state before a call
    const from = f && f.type === "read" ? f.state : 0;
    const succ = dfa.trans[from].filter((t) => t >= 0);
    if (new Set(succ).size <= 8) succ.forEach((t) => keep.add(t));
    const ch = f ? [...$("sim-input").value][f.forward] : undefined;
    if (ch !== undefined) { const t = dfa.trans[from][dfa.classOf(ch)]; if (t >= 0) keep.add(t); }
    return keep;
  }

  function drawDfa() {
    const note = $("dfa-note");
    if (!sc) { drawAutomatonGraph("dfa", dfaView, { nodes: [], start: 0, edges: [] }); note.textContent = ""; return; }
    const { dfa, rules } = sc;
    const keep = dfaShown();
    dfaIx = indexOf(dfa.states.length, keep);
    note.textContent = keep ? dfa.states.length + " states in all: the part around the current state. The table has them all." : "";
    const dp = new Map(), loops = new Map();
    classIds = new Map();
    dfa.trans.forEach((row, from) => row.forEach((to, c) => {
      if (to < 0 || !dfaIx.has(from) || !dfaIx.has(to)) return;
      const m = from === to ? loops : dp, key = from + ">" + to;
      if (!m.has(key)) m.set(key, { from: dfaIx.get(from), to: dfaIx.get(to), node: dfaIx.get(from), labels: [], ids: [] });
      // one id for each class on each edge: "from:to:class"
      const id = dfaIx.get(from) + ":" + dfaIx.get(to) + ":" + c;
      m.get(key).labels.push(dfa.classes[c].label);
      m.get(key).ids.push(id);
      if (!classIds.has(c)) classIds.set(c, []);
      classIds.get(c).push(id);
    }));
    // a label that is short is drawn on its edge; a long one is left out (⋯) and is in the tooltip
    for (const e of [...dp.values(), ...loops.values()]) if (e.labels.join(", ").length > SHORT_LABEL) e.labels = e.labels.map((_, k) => (k === 0 ? AG_MORE : null)).filter((x) => x !== null);
    const ids = [...dfaIx.keys()];
    drawAutomatonGraph("dfa", dfaView, {
      nodes: ids.map((i) => { const st = dfa.states[i]; return { label: String(st.id), accepting: st.accept >= 0, tag: st.accept >= 0 ? rules[st.accept].name : undefined }; }),
      start: dfaIx.get(0),
      edges: [...dp.values()],
      loops: [...loops.values()],
      joinLabels: true,
      reserveLabels: true,
      onHover: (hot) => {
        // an edge: its classes in a tooltip, and the edge marked; the class rows are marked too
        markClasses(hot ? hot.map((id) => +id.split(":")[2]) : null);
        if (hot) { setGraphHot("dfa", hot); showTip(edgeTip(hot)); } else { showTaken(currentFrame()); hideTip(); }
      },
      onNodeHover: (i) => { setGraphNodeHot("dfa", i); if (i !== null) showTip(stateTip(dfaIds[i])); else hideTip(); },
    });
    dfaIds = ids;
    ids.forEach((i) => { const st = dfa.states[i]; if (st.rules.length) d3.select("#dfa-state-" + dfaIx.get(i)).attr("data-prod", st.rules.map((r) => r + 1).join(" ")); });
  }

  // A class is marked where the pointer is: its row in the list, and its edges in the graph.
  function markClasses(ids) {
    document.querySelectorAll("#sc-classes .sc-class").forEach((e) => e.classList.toggle("is-hot", !!ids && ids.includes(+e.dataset.c)));
  }

  function drawClasses() {
    const el = $("sc-classes");
    if (!sc) { el.innerHTML = ""; return; }
    const { dfa, nfa } = sc;
    const n = nfa.alphabet.length;
    let h = '<div class="sc-note">The rules mention ' + n + " character" + (n === 1 ? "" : "s") + ". Characters that no state tells apart share an edge: " + dfa.classes.length + " class" + (dfa.classes.length === 1 ? "" : "es") + (dfa.atomCount > dfa.classes.length ? " (" + dfa.atomCount + " before the DFA is minimal)" : "") + ". Any other character is in the class “other”.</div>";
    dfa.classes.forEach((c, k) => {
      const named = c.chars.filter((x) => x !== SCN_OTHER);
      h += '<div class="sc-class" data-c="' + k + '"><span class="sc-class-name">' + esc(c.label) + '</span><span class="sc-class-members">' + (named.length ? named.length + " character" + (named.length === 1 ? "" : "s") : "every character no rule mentions") + "</span></div>";
    });
    el.innerHTML = h;
    el.querySelectorAll(".sc-class").forEach((row) => {
      const c = +row.dataset.c;
      row.addEventListener("mouseenter", () => { markClasses([c]); setGraphHot("dfa", classIds.get(c) || []); });
      row.addEventListener("mouseleave", () => { markClasses(null); showTaken(currentFrame()); });
    });
  }

  function drawTable() {
    const el = $("sc-table");
    if (!sc) { el.innerHTML = ""; return; }
    const { dfa, rules } = sc;
    let h = '<table class="sc-table"><thead><tr><th>state</th>' + dfa.classes.map((c) => "<th>" + esc(c.label) + "</th>").join("") + "<th>token</th></tr></thead><tbody>";
    dfa.states.forEach((st) => {
      h += '<tr data-state="' + st.id + '"' + (st.rules.length ? ' data-prod="' + st.rules.map((r) => r + 1).join(" ") + '"' : "") + (st.accept >= 0 ? ' class="is-accept"' : "") + "><td>" + st.id + "</td>";
      dfa.trans[st.id].forEach((t, c) => { h += '<td data-c="' + c + '">' + (t < 0 ? "" : t) + "</td>"; });
      h += "<td>" + (st.accept >= 0 ? esc(rules[st.accept].name) + (st.rules.length > 1 ? " (also " + st.rules.slice(1).map((r) => esc(rules[r].name)).join(", ") + ")" : "") : "") + "</td></tr>";
    });
    el.innerHTML = h + "</tbody></table>";
  }

  // ── Running ───────────────────────────────────────────────
  function visible() { return run ? run.frames.filter((f) => fine || !f.fine) : []; }
  function currentFrame() { return frames.length ? frames[Math.min(sim.pos, frames.length - 1)] : null; }

  function runString() {
    run = sc ? scnRun(sc, $("sim-input").value) : null;
    frames = visible();
    sim.pos = 0;
    sim.refresh();
    saveShare();
    render();
  }

  function setGrain(f) {
    const cur = currentFrame();
    fine = f;
    const all = run ? run.frames : [];
    frames = visible();
    const at = cur ? all.indexOf(all.find((x) => x === cur || JSON.stringify(x) === JSON.stringify(cur))) : 0;
    let pos = 0;
    frames.forEach((fr, k) => { if (all.indexOf(fr) <= at) pos = k; });
    sim.pos = pos;
    sim.refresh();
    render();
  }

  function render() {
    const f = currentFrame();
    const el = $("cm-log");
    el.className = "cm-log" + (f && f.type === "error" ? " is-error" : "");
    el.textContent = f ? f.msg : sc ? "" : "Define the token rules.";
    renderInput(f);
    renderTokens(f);
    markPath(f);
  }

  function renderInput(f) {
    const el = $("cm-input");
    const chars = [...$("sim-input").value];
    el.innerHTML = "";
    if (!chars.length) { el.innerHTML = '<span class="cm-empty">empty input</span>'; return; }
    chars.forEach((ch, i) => {
      const s = document.createElement("span");
      let cls = "cm-ch";
      if (f) {
        // read in this call (blue); the character with no transition, and what was read beyond the lexeme (orange); consumed before (faded)
        const lexEnd = f.type === "stop" && f.dead ? f.forward - 1 : f.forward;
        const peekEnd = f.type === "stop" && f.dead ? f.forward : f.type === "error" ? f.forward : f.readTo !== undefined ? f.readTo : f.forward;
        if (f.type === "error") { if (i >= f.begin && i < f.forward) cls += " is-peek"; else if (i < f.begin) cls += " is-done"; }
        else if (i >= f.begin && i < lexEnd) cls += " is-lex";
        else if (i >= lexEnd && i < peekEnd && f.type !== "start" && f.type !== "end") cls += " is-peek";
        else if (i < f.begin) cls += " is-done";
      }
      if (ch === " ") cls += " is-sp";
      s.className = cls;
      s.textContent = ch === " " ? "·" : ch === "\n" ? "↵" : ch === "\t" ? "→" : ch;
      el.appendChild(s);
    });
  }

  function renderTokens(f) {
    const el = $("cm-tokens");
    el.innerHTML = "";
    const toks = f ? f.tokens : [];
    if (!toks.length) { el.innerHTML = '<span class="cm-empty">none yet</span>'; return; }
    toks.forEach((t) => {
      const c = document.createElement("span");
      c.className = "cm-tok";
      c.innerHTML = '<span class="cm-tok-name">' + esc(t.name) + '</span><span class="cm-tok-lex">' + esc(t.lexeme) + "</span>";
      c.title = "Characters " + t.start + " to " + t.end;
      el.appendChild(c);
    });
  }

  // The DFA at this frame: the state the scanner is in (blue), the path it has taken (blue edges, orange states), the
  // last accepting state it has seen (green); the same state in the table.
  function markPath(f) {
    if (dfaFocus() && sc) drawDfa();
    const ix = (s) => (dfaIx.has(s) ? dfaIx.get(s) : -1);
    d3.selectAll("#dfa-graph-root .ag-node").classed("is-hot", false).classed("is-last", false);
    d3.selectAll("#dfa-graph-root .ag-edge").classed("is-active", false);
    highlightAutomatonStates("dfa", []);
    document.querySelectorAll("#sc-table tr").forEach((r) => r.classList.remove("is-now"));
    if (!f || !sc) return;
    for (const s of f.path || []) d3.select("#dfa-state-" + ix(s)).classed("is-hot", true);
    for (const [a, b] of f.edges || []) {
      const x = ix(a), y = ix(b);
      if (x < 0 || y < 0) continue;
      d3.selectAll('#dfa-graph-root [data-edge="' + x + "-" + y + '"], #dfa-graph-root [data-self="' + x + '"]').filter(function () { return x === y ? this.dataset.self !== undefined : this.dataset.edge !== undefined; }).classed("is-active", true);
    }
    if (f.last) d3.select("#dfa-state-" + ix(f.last.state)).classed("is-last", true);
    showTaken(f);
    if (f.state !== null && f.state !== undefined) {
      highlightAutomatonStates("dfa", [ix(f.state)]);
      const row = document.querySelector('#sc-table tr[data-state="' + f.state + '"]');
      if (row) row.classList.add("is-now");
    }
  }

  // ── The tooltip of the DFA: what an edge or a state stands for, in several lines ──
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

  // a class: its label and what it contains
  function classLine(c) {
    const k = sc.dfa.classes[c];
    const named = k.chars.filter((x) => x !== SCN_OTHER);
    const list = named.length > 1 ? scnShowChars(named) : "";
    const what = (named.length ? named.length + " character" + (named.length === 1 ? "" : "s") + (list && list !== k.label.replace(/^\[|\]$/g, "") ? ": " + esc(list.length > 60 ? list.slice(0, 60) + "…" : list) : "") : "") + (k.chars.includes(SCN_OTHER) ? (named.length ? "; " : "") + "any character no rule mentions" : "");
    return "<div><b>" + esc(k.label) + "</b> <span>" + what + "</span></div>";
  }
  // the state an index of the drawing stands for, and the edge between two of them
  function edgeTip(ids) {
    const [a, b] = ids[0].split(":").map(Number);
    const from = dfaIds[a], to = dfaIds[b];
    const st = sc.dfa.states[to];
    return '<div class="sc-tip-head">State ' + from + " → " + to + "</div>" + ids.map((id) => classLine(+id.split(":")[2])).join("") +
      (st.accept >= 0 ? "<div class='sc-tip-foot'>State " + to + " accepts " + esc(sc.rules[st.accept].name) + "</div>" : "");
  }
  function stateTip(id) {
    const { dfa, rules } = sc, st = dfa.states[id];
    let h = '<div class="sc-tip-head">State ' + id + (id === 0 ? " (start)" : "") + "</div>";
    if (st.accept >= 0) h += "<div>Accepts <b>" + esc(rules[st.accept].name) + "</b>" + (st.rules.length > 1 ? "; also matches " + st.rules.slice(1).map((r) => esc(rules[r].name)).join(", ") + ", which come later" : "") + "</div>";
    const out = new Map();
    dfa.trans[id].forEach((t, c) => { if (t >= 0) { if (!out.has(t)) out.set(t, []); out.get(t).push(dfa.classes[c].label); } });
    const rows = [...out].map(([t, cs]) => "<div>→ <b>" + t + "</b> <span>on " + esc(cs.join(", ")) + "</span></div>");
    h += rows.length ? rows.slice(0, 8).join("") + (rows.length > 8 ? "<div><span>… and " + (rows.length - 8) + " more states</span></div>" : "") : "<div><span>No transitions out</span></div>";
    return h;
  }

  // The transition just taken is marked on the graph (its class is in the log).
  function showTaken(f) {
    setGraphHot("dfa", []);
    if (!f || !sc || f.type !== "read" || !f.edges || !f.edges.length) return;
    const [a, b] = f.edges[f.edges.length - 1];
    const ch = [...$("sim-input").value][f.forward - 1];
    if (ch === undefined || !dfaIx.has(a) || !dfaIx.has(b)) return;
    setGraphHot("dfa", [dfaIx.get(a) + ":" + dfaIx.get(b) + ":" + sc.dfa.classOf(ch)]);
  }

  // ── Examples and sharing ──────────────────────────────────
  function loadExampleKey(k) {
    if (!k) return;
    const ex = EXAMPLES[k];
    if (!ex) return;
    $("examples-select").value = k;
    $("token-input").value = Array.isArray(ex.tokens) ? ex.tokens.join("\n") : ex.tokens || "";
    strings = ex.strings || [];
    $("sim-input").value = strings[0] || "";
    build();
  }

  const saveShare = createShareSaver(() => ({ t: $("token-input").value, s: $("sim-input").value }));
  let sharedApplied = false;
  function applyShareState() {
    const st = readShareState();
    if (!st || !shareIsPlain(st)) return;
    const t = shareText(st.t, SHARE_MAX_TEXT), s = shareSimInput(st.s);
    if (t === null || s === null) return;
    sharedApplied = true;
    $("token-input").value = t;
    $("sim-input").value = s;
  }

  function init(config) {
    cfg = config;
    initResize("rh-1", "p-rules", +1);
    initResize("rh-2", "p-nfa", +1);
    initResize("rh-3", "p-dfa", +1);
    editor = ScannerEditor.attach($("token-input"));
    applySections();
    nfaView = createGraphView("nfa", { hasNodes: () => !!sc, onRelayout: () => { drawGraphs(); markPath(currentFrame()); } });
    dfaView = createGraphView("dfa", { hasNodes: () => !!sc, onRelayout: () => { drawGraphs(); markPath(currentFrame()); } });
    sim = createStepper({
      buttons: { reset: "btn-sim-reset", back: "btn-sim-back", step: "btn-sim-step", all: "btn-sim-all" },
      min: 0,
      last: () => (frames.length ? frames.length - 1 : null),
      onChange: render,
    });
    $("btn-sim-reset").addEventListener("click", () => sim.reset());
    $("btn-sim-back").addEventListener("click", () => sim.prev());
    $("btn-sim-step").addEventListener("click", () => sim.next());
    $("btn-sim-all").addEventListener("click", () => sim.end());
    registerStepper("p-run", { step: () => sim.next(), back: () => sim.prev(), reset: () => sim.reset(), end: () => sim.end() }, { primary: true });
    const pickRule = (e) => {
      const r = e.target.closest && e.target.closest(".se-row[data-live]");
      if (r && +r.dataset.live !== nfaRule) { nfaRule = +r.dataset.live; if (nfaOne()) drawNfa(); }
    };
    $("p-rules").addEventListener("mouseover", pickRule);
    $("p-rules").addEventListener("focusin", pickRule);
    $("grain-coarse").addEventListener("change", () => setGrain(false));
    $("grain-fine").addEventListener("change", () => setGrain(true));
    UI.stringInput("sim-input", { examples: () => strings, onPick: runString });
    $("sim-input").addEventListener("input", runString);
    let timer = null;
    $("token-input").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(build, 350); });
    initPanelStorage(cfg.storage, ["p-rules", "p-nfa", "p-dfa", "p-run"]);
    loadPanelState();
    initAlgoModal();
    applyShareState();
    loadExamplesInto(cfg.examples, "examples-select", EXAMPLES, () => {
      const first = Object.keys(EXAMPLES)[0];
      if (sharedApplied) build();
      else if (first) loadExampleKey(first);
    });
  }

  return { init, loadExample: loadExampleKey };
})();
