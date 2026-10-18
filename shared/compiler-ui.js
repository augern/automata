// The view shared by the compiler-construction tools (Scanner and Parser, Syntax-Directed Translation, Types and
// Symbol Table). A page has the panels p-def (token rules, grammar), p-run (input, stepper, the scanner's bites, the
// token stream, the parser stack), p-tree (the parse tree) and p-out (results); CompilerTool.init(cfg) wires them to
// the engine in algo/compiler.js. Needs d3, shared.js, ui.js, stepper.js and fit-view.js.
//
// What the views show follows from the definition (see features below): attributes on the tree and the stack when
// the grammar has actions, and the results sections the actions use.
//   cfg.examples   the url of the tool's examples.json
//   cfg.storage    the key of the panel layout in localStorage
const CompilerTool = (() => {
  let comp = null, run = null, strings = [], view = null, cfg = null;
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
      render();
      return;
    }
    feat = features(comp);
    const notes = [];
    if (comp.missing.length) notes.push("No token rule for: " + comp.missing.join(", ") + ".");
    if (comp.tables.conflicts.length) notes.push(comp.tables.conflicts.length + " SLR(1) conflict(s): the parser prefers shift.");
    setError(notes.join(" "), true);
    saveShare();
    runString();
  }

  // ── Running ───────────────────────────────────────────────
  function runString() {
    run = null;
    if (comp) {
      const r = cmpRun(comp, $("sim-input").value);
      run = r;
    }
    sim.pos = 0;
    sim.refresh();
    saveShare();
    render();
  }

  // ── Rendering a frame ─────────────────────────────────────
  function attrText(attrs) {
    const parts = [];
    for (const k of Object.keys(attrs || {})) {
      if (k === "name" || k === "start" || k === "end" || k === "entry") continue;
      if (k === "lexeme" && attrs.val === attrs.lexeme) continue;
      let v = attrs[k];
      if (typeof v === "number") v = Math.round(v * 1e6) / 1e6;
      if (v === "" || v === undefined || v === null) continue;
      parts.push((k === "val" ? "" : k + "=") + v);
    }
    return parts.join("  ");
  }

  function render() {
    const f = run ? run.frames[Math.min(sim.pos, run.frames.length - 1)] : null;
    renderLog(f);
    renderInput(f);
    renderTokens(f);
    renderStack(f);
    renderTree(f);
    renderOut(f);
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
    const lex = f && f.lex;
    chars.forEach((ch, i) => {
      const s = document.createElement("span");
      let cls = "cm-ch";
      if (f) {
        if (lex && i >= lex.start && i < lex.end) cls += " is-lex";
        else if (lex && i >= lex.end && i < lex.readTo) cls += " is-peek";
        else if (i < (lex ? lex.start : f.cursor)) cls += " is-done";
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
      c.innerHTML = '<span class="cm-tok-name">' + esc(t.name) + '</span><span class="cm-tok-lex">' + esc(t.lexeme) + "</span>";
      c.title = "Characters " + t.start + " to " + t.end;
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
    const label2 = (n) => (feat.annotate ? attrText(n.node.attrs) : "");
    const lay = {
      width: (n) => Math.max(treeNodeW(n.symbol), label2(n).length * 6 + 16), half: feat.annotate ? 20 : 18, row: feat.annotate ? 74 : 60,
    };
    const dir = treeChooseDir(vr, nodes, lay, "tree-svg");
    treePlace(vr, nodes, dir, lay);
    treeBaseline(g, nodes, dir);
    edges.forEach(({ p, c }) => g.append("path").attr("class", "tree-edge").attr("d", treeEdgePath(p, c, dir)));
    nodes.forEach((n) => {
      const isNt = nt.has(n.symbol);
      const ng = g.append("g").attr("class", "tree-node" + (isNt ? "" : " terminal")).attr("transform", "translate(" + n._x + "," + n._y + ")");
      ng.append("rect").attr("class", "tn-shape").attr("x", -n._w / 2).attr("y", -n._half).attr("width", n._w).attr("height", 2 * n._half).attr("rx", Math.min(n._half, 14));
      const second = label2(n);
      ng.append("text").attr("dy", second ? "-4" : "0").text(n.symbol);
      if (second) ng.append("text").attr("class", "rule-label").attr("dy", "10").text(second);
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
    strings = ex.strings || [];
    $("sim-input").value = strings[0] || "";
    build();
  }

  const saveShare = createShareSaver(() => ({ t: $("token-input").value, g: $("grammar-input").value, s: $("sim-input").value }));
  let sharedApplied = false;
  function applyShareState() {
    const st = readShareState();
    if (!st || !shareIsPlain(st)) return;
    const t = shareText(st.t, SHARE_MAX_TEXT), g = shareText(st.g, SHARE_MAX_TEXT), s = shareSimInput(st.s);
    if (t === null || g === null || s === null) return;
    sharedApplied = true;
    $("token-input").value = t;
    $("grammar-input").value = g;
    $("sim-input").value = s;
  }

  function init(config) {
    cfg = config;
    initResize("rh-1", "p-def", +1);
    initResize("rh-2", "p-run", +1);
    initResize("rh-3", "p-tree", +1);
    view = createFitView({ svg: "tree-svg", root: "tree-root", scaleExtent: [0.08, 4], maxScale: 1.2, pad: 24, hasContent: () => !!lastForest && lastForest.length > 0 });
    treeRegisterPanel("p-tree", "tree-svg", () => drawTree());
    sim = createStepper({
      buttons: { reset: "btn-sim-reset", back: "btn-sim-back", step: "btn-sim-step", all: "btn-sim-all" },
      min: 0,
      last: () => (run ? run.frames.length - 1 : null),
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
