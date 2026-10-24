// The view of the scanner tool. A page has the panels p-rules (the token rules, in the scanner editor), p-nfa (the NFA of all
// rules and the character classes), p-dfa (the minimal DFA and its transition table) and p-run (the input, the stepper,
// the tokens returned); ScannerTool.init(cfg) wires them to the engine in algo/scanner.js. Needs d3, dagre, shared.js,
// ui.js, stepper.js, fit-view.js, automaton-graph.js and the scanner editor.
//   cfg.examples   the url of the tool's examples.json
//   cfg.storage    the key of the panel layout in localStorage
const ScannerTool = (() => {
  let sc = null, run = null, strings = [], cfg = null, sim = null, editor = null, nfaView = null, dfaGraph = null;
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

  // Notes under the rules: a rule that never matches, and the rules that lose to earlier ones.
  function flagRules() { if (editor) editor.flag(ScannerGraph.notes(sc)); }

  // ── The graphs ────────────────────────────────────────────
  // A real scanner's NFA is too big to read as one picture, so above a size it shows the NFA of one rule (the one
  // pointed at in the rules); the DFA's part view is in shared/scanner-graph.js. The panel menus choose.
  const NFA_BIG = 40;
  let nfaMode = "auto", nfaRule = 0;
  const nfaOne = () => !!sc && (nfaMode === "rule" || (nfaMode === "auto" && sc.nfa.n > NFA_BIG));
  let nfaIx = new Map(); // state → its index in what is drawn
  panelMenuExtras["p-nfa"] = () => [
    { heading: "NFA view" },
    { label: "Automatic", checked: nfaMode === "auto", title: "All rules up to " + NFA_BIG + " states, else one rule", onSelect: () => { nfaMode = "auto"; drawNfa(); } },
    { label: "All rules", checked: nfaMode === "whole", onSelect: () => { nfaMode = "whole"; drawNfa(); } },
    { label: "One rule", checked: nfaMode === "rule", title: "The NFA of the rule pointed at in the token rules", onSelect: () => { nfaMode = "rule"; drawNfa(); } },
    { separator: true },
    { label: "Character classes", checked: shown.classes, onSelect: () => { shown.classes = !shown.classes; applySections(); } },
  ];
  panelMenuExtras["p-dfa"] = () => [
    ...dfaGraph.menu(),
    { separator: true },
    { label: "Transition table", checked: shown.table, onSelect: () => { shown.table = !shown.table; applySections(); } },
  ];

  // The character classes and the transition table are kept, but off unless the panel menu shows them.
  const shown = { classes: false, table: false };
  function applySections() {
    $("p-nfa").querySelector(".sc-section").hidden = !shown.classes;
    $("p-dfa").querySelector(".sc-section").hidden = !shown.table;
    if (nfaView) nfaView.fit();
    if (dfaGraph) dfaGraph.view.fit();
  }
  function drawGraphs() {
    drawNfa();
    dfaGraph.draw();
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
    nfa.accept.forEach((k, s) => { if (nfaIx.has(s)) d3.select("#nfa-state-" + nfaIx.get(s)).attr("data-tok", k + 1); });
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
      row.addEventListener("mouseenter", () => { markClasses([c]); dfaGraph.hotClass(c); });
      row.addEventListener("mouseleave", () => { markClasses(null); dfaGraph.unhot(); });
    });
  }

  function drawTable() {
    const el = $("sc-table");
    if (!sc) { el.innerHTML = ""; return; }
    const { dfa, rules } = sc;
    let h = '<table class="sc-table"><thead><tr><th>state</th>' + dfa.classes.map((c) => "<th>" + esc(c.label) + "</th>").join("") + "<th>token</th></tr></thead><tbody>";
    dfa.states.forEach((st) => {
      h += '<tr data-state="' + st.id + '"' + (st.rules.length ? ' data-tok="' + st.rules.map((r) => r + 1).join(" ") + '"' : "") + (st.accept >= 0 ? ' class="is-accept"' : "") + "><td>" + st.id + "</td>";
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
      // a token named as its lexeme (an operator, a keyword) says it once
      c.innerHTML = t.name === t.lexeme ? '<span class="cm-tok-lex">' + esc(t.lexeme) + "</span>" : '<span class="cm-tok-name">' + esc(t.name) + '</span><span class="cm-tok-lex">' + esc(t.lexeme) + "</span>";
      c.title = "Characters " + t.start + " to " + t.end;
      c.dataset.tok = t.rule + 1; // linked with its rule in the token rules (see "Production and token links" in shared.js)
      el.appendChild(c);
    });
  }

  // Where the scanner is at this frame, for the DFA graph (shared/scanner-graph.js), and the same state in the table.
  function dfaPosition() {
    const f = currentFrame();
    if (!f || !sc) return null;
    const chars = [...$("sim-input").value];
    const taken = f.type === "read" && f.edges && f.edges.length ? { a: f.edges[f.edges.length - 1][0], b: f.edges[f.edges.length - 1][1], cls: sc.dfa.classOf(chars[f.forward - 1]) } : null;
    return { state: f.state, path: f.path, edges: f.edges, last: f.last, from: f.type === "read" ? f.state : 0, ch: chars[f.forward], taken };
  }
  function markPath(f) {
    dfaGraph.mark();
    document.querySelectorAll("#sc-table tr").forEach((r) => r.classList.remove("is-now"));
    if (f && sc && f.state !== null && f.state !== undefined) {
      const row = document.querySelector('#sc-table tr[data-state="' + f.state + '"]');
      if (row) row.classList.add("is-now");
    }
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
    nfaView = createGraphView("nfa", { hasNodes: () => !!sc, onRelayout: () => { drawNfa(); } });
    dfaGraph = ScannerGraph.create({ prefix: "dfa", noteId: "dfa-note", getSc: () => sc, getView: dfaPosition, onClasses: markClasses });
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
