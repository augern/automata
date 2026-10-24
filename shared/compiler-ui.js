// The view shared by the compiler-construction tools (Scanner and Parser, Syntax-Directed Translation, Types and
// Symbol Table). A page has the panels p-def (token rules, grammar), p-run (input, stepper, what the scanner has consumed, the
// token stream, the parser stack), p-tree (the parse tree) and p-out (results); CompilerTool.init(cfg) wires them to
// the engine in algo/compiler.js. Needs d3, dagre, shared.js, ui.js, stepper.js, fit-view.js, automaton-graph.js,
// scanner-graph.js and the grammar and scanner editors.
//
// What the views show follows from the definition (see features below): attributes on the tree and the stack when
// the grammar has actions, and the results sections the actions use.
//   cfg.examples   the url of the tool's examples.json
//   cfg.storage    the key of the panel layout in localStorage
const CompilerTool = (() => {
  let comp = null, run = null, strings = [], view = null, cfg = null;
  let fine = false, frames = [], scannerGraph = null, tokenEditor = null; // frames: the ones the stepper walks (coarse: without the one-character ones of the scanner)
  let feat = { annotate: false, out: [] };
  const $ = (id) => document.getElementById(id);
  let sim = null;

  // ── The definition ────────────────────────────────────────
  function setError(msg, note) {
    const el = $("error-msg");
    el.textContent = msg || "";
    el.classList.toggle("is-note", !!note);
  }

  // From the actions: attributes are shown when there are any; quadruples when they use emit; the symbol table when
  // there is an id token (with a type column when the actions use types); values when the actions only compute them.
  function features(c) {
    const src = c.grammar.rules.map((r) => r.action || "").join("\n");
    const has = c.grammar.rules.some((r) => r.action);
    const quads = /\bemit\(/.test(src), types = /\b(install|lookup)\(|\.type\b/.test(src);
    const out = [];
    if (has && !quads && !types) out.push("value");
    if (quads) out.push("quads");
    if (c.tokenRules.some((r) => r.name === "id") || types) out.push(types ? "types" : "symtab");
    if (types) out.push("messages");
    return { annotate: has, out };
  }

  function build() {
    comp = null;
    try {
      comp = cmpCompile($("token-input").value, $("grammar-input").value, "SLR1");
    } catch (e) {
      setError(e.message);
      run = null;
      frames = [];
      drawAutomaton();
      scannerGraph.draw();
      tokenEditor.flag([]);
      render();
      return;
    }
    feat = features(comp);
    drawAutomaton();
    scannerGraph.draw();
    tokenEditor.flag(ScannerGraph.notes(comp.scanner));
    editor.refreshLinks();
    const notes = [];
    if (comp.missing.length) notes.push("No token rule for: " + comp.missing.join(", ") + ".");
    if (comp.tables.conflicts.length) notes.push(comp.tables.conflicts.length + " SLR(1) conflict(s): the parser prefers shift.");
    setError(notes.join(" "), true);
    saveShare();
    runString();
  }

  // ── Running ───────────────────────────────────────────────
  const visible = () => (run ? run.frames.filter((f) => fine || !f.fine) : []);
  const currentFrame = () => (frames.length ? frames[Math.min(sim.pos, frames.length - 1)] : null);
  function runString() {
    run = null;
    if (comp) {
      const r = cmpRun(comp, $("sim-input").value, { fine: true });
      run = r;
    }
    frames = visible();
    sim.pos = 0;
    sim.refresh();
    saveShare();
    render();
  }

  // ── Rendering a frame ─────────────────────────────────────
  // The attributes of a node or stack entry as short items ("val" without its name). A token whose lexeme is its own
  // name (an operator, a keyword) says nothing more than the node itself, and a lexeme equal to the value is not
  // repeated.
  // Split into what the scanner provides (a token's lexeme and value) and what the actions compute.
  function attrGroups(attrs) {
    const g = { scanner: [], sem: [] };
    if (!attrs) return g;
    if (attrs.name !== undefined && attrs.lexeme === attrs.name) return g;
    const isToken = attrs.name !== undefined;
    for (const k of Object.keys(attrs)) {
      if (k === "name" || k === "start" || k === "end" || k === "entry") continue;
      if (k === "lexeme" && String(attrs.val) === attrs.lexeme) continue;
      let v = attrs[k];
      if (typeof v === "number") v = Math.round(v * 1e6) / 1e6;
      if (v === "" || v === undefined || v === null) continue;
      (isToken && (k === "val" || k === "lexeme") ? g.scanner : g.sem).push((k === "val" ? "" : k + "=") + v);
    }
    return g;
  }
  function attrParts(attrs) { const g = attrGroups(attrs); return g.scanner.concat(g.sem); }
  const attrText = (attrs) => attrParts(attrs).join("  ");

  function render() {
    const f = currentFrame();
    renderLog(f);
    renderInput(f);
    renderTokens(f);
    renderStack(f);
    renderTree(f);
    renderOut(f);
    renderGrammar(f);
    renderAutomaton(f);
    scannerGraph.mark();
    // the machine that has just moved has its heading accented
    $("sd-head").classList.toggle("is-active", !!f && f.machine === "scanner");
    $("au-head").classList.toggle("is-active", !!f && f.machine === "parser");
  }

  // Fine steps: a step for every character the scanner reads
  function setGrain(f) {
    const cur = currentFrame();
    fine = f;
    const all = run ? run.frames : [];
    frames = visible();
    const at = cur ? all.indexOf(cur) : 0;
    let pos = 0;
    frames.forEach((fr, k) => { if (all.indexOf(fr) <= at) pos = k; });
    sim.pos = pos;
    sim.refresh();
    render();
  }

  // Where the scanner is at this frame, for the DFA graph (shared/scanner-graph.js)
  function scannerPosition() {
    const f = currentFrame();
    if (!f || !comp) return null;
    const chars = [...$("sim-input").value], dfa = comp.scanner.dfa, s = f.scn;
    if (!s) return { path: [], edges: [], last: null, from: 0, ch: chars[f.cursor] };
    const read = f.type === "read";
    const taken = read && s.edges.length ? { a: s.edges[s.edges.length - 1][0], b: s.edges[s.edges.length - 1][1], cls: dfa.classOf(chars[f.lex.end - 1]) } : null;
    return { state: s.state, path: s.path, edges: s.edges, last: s.last, from: read ? s.state : 0, ch: read ? chars[f.lex.end] : f.type === "stop" ? undefined : chars[f.cursor], taken };
  }

  // ── The parser automaton: the states as numbers only (the compact form of the LR tool) ──
  let autoView = null;
  function drawAutomaton() {
    if (!autoView) return;
    if (!comp) { drawAutomatonGraph("au", autoView, { nodes: [], start: 0, edges: [] }); return; }
    const { states, edges } = comp.auto;
    const pairs = new Map(), loops = new Map();
    edges.forEach((e, i) => {
      const m = e.s === e.t ? loops : pairs, key = e.s + ">" + e.t;
      if (!m.has(key)) m.set(key, { from: e.s, to: e.t, node: e.s, labels: [], ids: [] });
      m.get(key).labels.push(e.label);
      m.get(key).ids.push(i);
    });
    drawAutomatonGraph("au", autoView, {
      nodes: states.map((st) => ({ label: String(st.id), accepting: st.accepting })),
      start: 0,
      edges: [...pairs.values()],
      loops: [...loops.values()],
      joinLabels: true,
      onHover: () => {}, // registers the edges' ids, which the stack's path is marked by
    });
  }
  // The states on the parser stack are marked, the top one as the current state, and the transitions between them.
  function renderAutomaton(f) {
    if (!autoView || !comp) return;
    d3.selectAll("#au-graph-root .ag-node").classed("is-hot", false);
    highlightAutomatonStates("au", []);
    setGraphHot("au", []);
    if (!f) return;
    const st = f.stack, ids = [];
    st.forEach((e, k) => {
      d3.select("#au-state-" + e.state).classed("is-hot", true);
      if (k > 0) {
        const i = comp.auto.edges.findIndex((x) => x.s === st[k - 1].state && x.t === e.state && x.label === e.sym);
        if (i >= 0) ids.push(i);
      }
    });
    highlightAutomatonStates("au", [st[st.length - 1].state]);
    setGraphHot("au", ids);
  }

  // The production being reduced is marked in the grammar editor, with the values its action read and made (production
  // 0, the added start production, is not in the editor).
  function renderGrammar(f) {
    const r = f && f.reduced;
    if (!editor) return;
    if (!r || r.rule < 1) { editor.run(null); return; }
    const show = (a, sym) => attrText(a) || (a && a.lexeme !== undefined ? JSON.stringify(a.lexeme) : "∅");
    editor.run({ rule: r.rule - 1, args: r.args.map((x) => show(x.attrs)), result: show(r.result) });
  }

  function renderLog(f) {
    const el = $("cm-log");
    el.className = "cm-log" + (f && f.type === "error" ? " is-error" : f && f.type === "accept" ? " is-accept" : "");
    el.textContent = f ? f.msg : comp ? "" : "Define the tokens and the grammar.";
  }

  function renderInput(f) {
    const el = $("cm-input");
    const chars = [...$("sim-input").value];
    el.innerHTML = "";
    if (!chars.length) { el.innerHTML = '<span class="cm-empty">empty input</span>'; return; }
    // Blue: the lexeme the scanner has just consumed, and, until the parser shifts it, the look-ahead token's lexeme.
    // Orange: characters read beyond it and given back. Faded: everything consumed before. The rest is normal.
    const lex = f && f.lex;
    const pending = f && !lex && f.la !== null && f.tokens.length ? f.tokens[f.tokens.length - 1] : null;
    const blue = lex ? [lex.start, lex.end] : pending ? [pending.start, pending.end] : null;
    chars.forEach((ch, i) => {
      const s = document.createElement("span");
      let cls = "cm-ch";
      if (f) {
        if (blue && i >= blue[0] && i < blue[1]) cls += " is-lex";
        else if (lex && i >= lex.end && i < lex.readTo) cls += " is-peek";
        else if (i < (blue ? blue[0] : f.cursor)) cls += " is-done";
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
    toks.forEach((t, i) => {
      const c = document.createElement("span");
      c.className = "cm-tok" + (f.la !== null && i === toks.length - 1 && f.type !== "shift" ? " is-la" : "");
      // a token named as its lexeme (an operator, a keyword) says it once
      c.innerHTML = t.name === t.lexeme ? '<span class="cm-tok-lex">' + esc(t.lexeme) + "</span>" : '<span class="cm-tok-name">' + esc(t.name) + '</span><span class="cm-tok-lex">' + esc(t.lexeme) + "</span>";
      c.title = "Characters " + t.start + " to " + t.end;
      if (t.rule !== undefined) c.dataset.tok = t.rule + 1; // linked with its rule in the token rules (see shared.js)
      el.appendChild(c);
    });
    if (f.la !== null) {
      const n = document.createElement("span");
      n.className = "cm-la-note";
      n.textContent = f.la === "$" ? "look-ahead: end of input" : "look-ahead: " + f.la;
      el.appendChild(n);
    }
  }

  function renderStack(f) {
    const el = $("cm-stack");
    if (!f) { el.innerHTML = ""; return; }
    let h = "<table class='cm-table'><thead><tr><th>state</th><th>symbol</th>" + (feat.annotate ? "<th>attributes</th>" : "") + "</tr></thead><tbody>";
    f.stack.forEach((s, i) => {
      const top = i === f.stack.length - 1;
      h += "<tr" + (top ? " class='is-top'" : "") + "><td>" + s.state + "</td><td>" + (s.sym === null ? "" : esc(s.sym)) + "</td>" + (feat.annotate ? "<td>" + esc(attrText(s.attrs)) + "</td>" : "") + "</tr>";
    });
    el.innerHTML = h + "</tbody></table>";
    el.scrollTop = el.scrollHeight;
  }

  // The parse tree: the same layout as the other parse trees (top-down or sideways).
  let lastForest = null;
  function renderTree(f) {
    lastForest = f ? f.forest : null;
    drawTree();
  }
  function drawTree() {
    const g = d3.select("#tree-root");
    g.selectAll("*").remove();
    const forest = lastForest;
    const empty = $("tree-empty");
    if (!forest || !forest.length) { empty.style.display = ""; return; }
    empty.style.display = "none";
    const convert = (n) => ({ id: n.id, symbol: n.sym, node: n, children: n.children.map(convert) });
    const roots = forest.map(convert);
    const vr = roots.length === 1 ? roots[0] : { id: -1, symbol: "", children: roots };
    const nodes = [], edges = [];
    (function col(n) { if (n.id !== -1) nodes.push(n); n.children.forEach((c) => { if (n.id !== -1) edges.push({ p: n, c }); col(c); }); })(vr);
    const nt = comp ? comp.grammar.nonterminals : new Set();
    // with actions, a node shows its attributes, one per line under the symbol
    const groups = (n) => (feat.annotate ? attrGroups(n.node.attrs) : { scanner: [], sem: [] });
    const lines = (n) => { const g = groups(n); return g.scanner.concat(g.sem); };
    const divided = (n) => { const g = groups(n); return g.scanner.length > 0 && g.sem.length > 0; };
    const height = (n) => lines(n).length * 11 + (divided(n) ? 7 : 0);
    const halfOf = (n) => Math.max(18, 14 + (height(n) + 13) / 2);
    const lay = { width: (n) => Math.max(treeNodeW(n.symbol), ...lines(n).map((l) => l.length * 6 + 16)), halfOf };
    const dir = treeChooseDir(vr, nodes, lay, "tree-svg");
    treePlace(vr, nodes, dir, lay);
    treeBaseline(g, nodes, dir);
    edges.forEach(({ p, c }) => g.append("path").attr("class", "tree-edge").attr("d", treeEdgePath(p, c, dir)));
    nodes.forEach((n) => {
      const isNt = nt.has(n.symbol);
      const ng = g.append("g").attr("class", "tree-node" + (isNt ? "" : " terminal")).attr("transform", "translate(" + n._x + "," + n._y + ")");
      ng.append("rect").attr("class", "tn-shape").attr("x", -n._w / 2).attr("y", -n._half).attr("width", n._w).attr("height", 2 * n._half).attr("rx", Math.min(n._half, 14));
      const gr = groups(n), ls = lines(n);
      const block = 13 + height(n); // the symbol, then the scanner's items, a divider, then the actions' items
      let y = -block / 2 + 8;
      ng.append("text").attr("dy", y).text(n.symbol);
      ls.forEach((l, i) => {
        if (divided(n) && i === gr.scanner.length) {
          ng.append("line").attr("class", "cm-divider").attr("x1", -n._w / 2 + 6).attr("x2", n._w / 2 - 6).attr("y1", y + 8).attr("y2", y + 8);
          y += 7;
        }
        y += 11;
        ng.append("text").attr("class", "rule-label").attr("dy", i === 0 ? y + 2 : y + 2).text(l);
      });
    });
    view.refit();
  }

  function renderOut(f) {
    const el = $("cm-out");
    if (!f) { el.innerHTML = ""; return; }
    let h = "";
    const top = f.stack[f.stack.length - 1];
    if (feat.out.includes("value")) {
      const done = f.type === "accept";
      const val = done && f.stack.length >= 2 ? f.stack[f.stack.length - 1].attrs.val : undefined;
      h += "<h3>Value</h3><p class='cm-value'>" + (done ? (val === undefined ? "<i>none</i>" : esc(typeof val === "number" ? String(Math.round(val * 1e6) / 1e6) : String(val))) : "<span class='cm-empty'>when the parse is accepted</span>") + "</p>";
    }
    if (feat.out.includes("quads")) {
      h += "<h3>Quadruples</h3>";
      h += f.quads.length ? "<table class='cm-table'><thead><tr><th>#</th><th>op</th><th>arg 1</th><th>arg 2</th><th>result</th></tr></thead><tbody>" + f.quads.map((q, i) => "<tr><td>" + i + "</td>" + q.map((x) => "<td>" + esc(x) + "</td>").join("") + "</tr>").join("") + "</tbody></table>" : "<p class='cm-empty'>none yet</p>";
    }
    if (feat.out.includes("symtab") || feat.out.includes("types")) {
      h += "<h3>Symbol table</h3>";
      const types = feat.out.includes("types");
      h += f.symtab.length ? "<table class='cm-table'><thead><tr><th>#</th><th>name</th>" + (types ? "<th>type</th>" : "") + "</tr></thead><tbody>" + f.symtab.map((e, i) => "<tr><td>" + i + "</td><td>" + esc(e.name) + "</td>" + (types ? "<td>" + esc(e.type || "") + "</td>" : "") + "</tr>").join("") + "</tbody></table>" : "<p class='cm-empty'>none yet</p>";
    }
    if (feat.out.includes("messages") && f.messages.length) h += "<h3>Messages</h3><ul class='cm-msgs'>" + f.messages.map((m) => "<li>" + esc(m) + "</li>").join("") + "</ul>";
    el.innerHTML = h;
  }

  // ── Examples and sharing ──────────────────────────────────
  function loadExampleKey(k) {
    if (!k) return;
    const ex = EXAMPLES[k];
    if (!ex) return;
    $("examples-select").value = k;
    $("token-input").value = (Array.isArray(ex.tokens) ? ex.tokens.join("\n") : ex.tokens || "");
    $("grammar-input").value = ex.text;
    exampleWatch();
    strings = ex.strings || [];
    $("sim-input").value = strings[0] || "";
    build();
  }

  const saveShare = createShareSaver(() => ({ t: $("token-input").value, g: $("grammar-input").value, x: exampleShareKey(), s: $("sim-input").value }));
  let sharedApplied = false;
  function applyShareState() {
    const st = readShareState();
    if (!st || !shareIsPlain(st)) return;
    const t = shareText(st.t, SHARE_MAX_TEXT), g = shareText(st.g, SHARE_MAX_TEXT), s = shareSimInput(st.s);
    if (t === null || g === null || s === null) return;
    sharedApplied = true;
    $("token-input").value = t;
    $("grammar-input").value = g;
    exampleRestoreLater(typeof st.x === "string" && /^ex\d{1,3}$/.test(st.x) ? st.x : undefined);
    $("sim-input").value = s;
  }

  let editor = null;
  function init(config) {
    cfg = config;
    tokenEditor = ScannerEditor.attach($("token-input"));
    // a terminal is linked with the token rule of its name
    const tokenOf = (name) => { const k = comp ? comp.tokenRules.findIndex((r) => !r.skip && r.name === name) : -1; return k >= 0 ? k + 1 : null; };
    editor = GrammarEditor.attach($("grammar-input"), { actions: true, actionHint: "$$ = $1 + $3", tokenOf });
    // the two editors are different views for the links between them, though they are in one panel
    document.querySelector(".ge").dataset.prodView = "grammar";
    document.querySelector(".se").dataset.prodView = "token-rules";
    initResize("rh-1", "p-def", +1);
    initResize("rh-2", "p-run", +1);
    initResize("rh-3", "p-tree", +1);
    view = createFitView({ svg: "tree-svg", root: "tree-root", scaleExtent: [0.08, 4], maxScale: 1.2, pad: 24, hasContent: () => !!lastForest && lastForest.length > 0 });
    treeRegisterPanel("p-tree", "tree-svg", () => drawTree());
    autoView = createGraphView("au", { hasNodes: () => !!comp, onRelayout: () => { drawAutomaton(); renderAutomaton(currentFrame()); } });
    scannerGraph = ScannerGraph.create({ prefix: "sd", noteId: "sd-note", getSc: () => (comp ? comp.scanner : null), getView: scannerPosition });
    panelMenuExtras["p-run"] = () => scannerGraph.menu();
    $("grain-coarse").addEventListener("change", () => setGrain(false));
    $("grain-fine").addEventListener("change", () => setGrain(true));
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
    UI.stringInput("sim-input", { examples: () => strings, onPick: runString });
    $("sim-input").addEventListener("input", runString);
    let timer = null;
    for (const id of ["token-input", "grammar-input"]) $(id).addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(build, 350); });
    initPanelStorage(cfg.storage, ["p-def", "p-run", "p-tree", "p-out"]);
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
