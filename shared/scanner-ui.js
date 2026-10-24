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
      const seen = new Set();
      for (const st of sc.dfa.states) {
        if (st.rules.length < 2) continue;
        const w = st.rules[0];
        for (const l of st.rules.slice(1)) {
          if (sc.shadowed.includes(l) || seen.has(l + ">" + w)) continue;
          seen.add(l + ">" + w);
          notes.push({ rule: l, kind: "info", text: "Where it matches the same lexeme as " + live[w].name + " (state " + st.id + "), " + live[w].name + " wins: it is earlier." });
        }
      }
    }
    editor.flag(notes);
  }

  // ── The graphs ────────────────────────────────────────────
  function drawGraphs() {
    if (!sc) {
      drawAutomatonGraph("nfa", nfaView, { nodes: [], start: 0, edges: [] });
      drawAutomatonGraph("dfa", dfaView, { nodes: [], start: 0, edges: [] });
      return;
    }
    // the NFA: states as numbers, the accepting ones tagged with their rule; an edge has one label for each set
    const { nfa, dfa, rules } = sc;
    const pairs = new Map();
    for (const e of nfa.edges) {
      const key = e.from + ">" + e.to;
      if (!pairs.has(key)) pairs.set(key, { from: e.from, to: e.to, labels: [], eps: true });
      const p = pairs.get(key);
      p.labels.push(e.set ? scnSetLabel(e.set) : "ε");
      if (e.set) p.eps = false;
    }
    drawAutomatonGraph("nfa", nfaView, {
      nodes: Array.from({ length: nfa.n }, (_, i) => ({ label: String(i), accepting: nfa.accept.has(i), tag: nfa.accept.has(i) ? rules[nfa.accept.get(i)].name : undefined })),
      start: 0,
      edges: [...pairs.values()],
      joinLabels: true,
      reserveLabels: true,
      hideEps: true,
      radius: 13,
    });
    nfa.accept.forEach((k, s) => d3.select("#nfa-state-" + s).attr("data-prod", k + 1));
    // the DFA: an edge has a label for each character class that takes it
    const dp = new Map(), loops = new Map();
    dfa.trans.forEach((row, from) => row.forEach((to, c) => {
      if (to < 0) return;
      const m = from === to ? loops : dp, key = from + ">" + to;
      if (!m.has(key)) m.set(key, { from, to, node: from, labels: [], ids: [] });
      m.get(key).labels.push(dfa.classes[c].label);
      m.get(key).ids.push(c);
    }));
    drawAutomatonGraph("dfa", dfaView, {
      nodes: dfa.states.map((st) => ({ label: String(st.id), accepting: st.accept >= 0, tag: st.accept >= 0 ? rules[st.accept].name : undefined })),
      start: 0,
      edges: [...dp.values()],
      loops: [...loops.values()],
      joinLabels: true,
      reserveLabels: true,
      onHover: (ids) => markClasses(ids),
    });
    dfa.states.forEach((st) => { if (st.rules.length) d3.select("#dfa-state-" + st.id).attr("data-prod", st.rules.map((r) => r + 1).join(" ")); });
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
      row.addEventListener("mouseenter", () => { markClasses([c]); setGraphHot("dfa", [c]); });
      row.addEventListener("mouseleave", () => { markClasses(null); setGraphHot("dfa", []); markPath(currentFrame()); });
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
    d3.selectAll("#dfa-graph-root .ag-node").classed("is-hot", false).classed("is-last", false);
    d3.selectAll("#dfa-graph-root .ag-edge").classed("is-active", false);
    highlightAutomatonStates("dfa", []);
    document.querySelectorAll("#sc-table tr").forEach((r) => r.classList.remove("is-now"));
    document.querySelectorAll("#sc-table td.is-taken").forEach((r) => r.classList.remove("is-taken"));
    if (!f || !sc) return;
    for (const s of f.path || []) d3.select("#dfa-state-" + s).classed("is-hot", true);
    for (const [a, b] of f.edges || []) d3.selectAll('#dfa-graph-root [data-edge="' + a + "-" + b + '"], #dfa-graph-root [data-self="' + a + '"]').filter(function () { return a === b ? this.dataset.self !== undefined : true; }).classed("is-active", true);
    if (f.last) d3.select("#dfa-state-" + f.last.state).classed("is-last", true);
    if (f.state !== null && f.state !== undefined) {
      highlightAutomatonStates("dfa", [f.state]);
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
