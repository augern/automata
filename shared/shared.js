// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// shared.js
// Common logic.
// currentGrammar must be set by the host tool before calling shared functions.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Suppress all transitions during the initial paint so panels don't animate
// into their restored positions on load. Removed after the first rendered frame.
document.documentElement.classList.add("preload");
requestAnimationFrame(function () {
  requestAnimationFrame(function () {
    document.documentElement.classList.remove("preload");
  });
});

const EPSILON = "ε"; // ε — single source of truth for the epsilon sentinel

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:PANEL-LAYOUT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const STORAGE_KEY = "parser-tools-v1";

// Default panel list for tools that use the shared key (ll1, lr).
// Tools with different panel IDs call initPanelStorage() before loadPanelState().
var _panelStorageKey = STORAGE_KEY;
var _panelIds = ["p-grammar", "p-main", "p-automaton", "p-tables", "p-tree"];

function initPanelStorage(key, ids) {
  _panelStorageKey = key;
  _panelIds = ids;
}

function savePanelState() {
  try {
    const s = {};
    _panelIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) s[id] = { width: el.style.width, collapsed: el.classList.contains("collapsed") };
    });
    localStorage.setItem(_panelStorageKey, JSON.stringify(s));
  } catch (e) {}
}

function loadPanelState() {
  try {
    const s = JSON.parse(localStorage.getItem(_panelStorageKey) || "{}");
    _panelIds.forEach((id) => {
      if (!s[id]) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (s[id].width) el.style.width = s[id].width;
      if (s[id].collapsed) {
        el.classList.add("collapsed");
        updateCollapseBtn(id, true);
      }
    });
  } catch (e) {}
}

function toggleCollapse(id) {
  const el = document.getElementById(id);
  const c = el.classList.toggle("collapsed");
  updateCollapseBtn(id, c);
  savePanelState();
}

function updateCollapseBtn(id, collapsed) {
  const btn = document.querySelector("#" + id + " .collapse-btn");
  if (!btn) return;
  const el = document.getElementById(id);
  const isLeft = el && el.dataset.collapse === "left";
  btn.innerHTML = isLeft ? (collapsed ? "&#8250;" : "&#8249;") : collapsed ? "&#8249;" : "&#8250;";
}

function initResize(hid, panelId, sign) {
  sign = sign || 1;
  var handle = document.getElementById(hid);
  var panelEl = document.getElementById(panelId);
  function startDrag(startX, startW) {
    handle.classList.add("dragging");
    panelEl.classList.add("resizing");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    panelEl.style.willChange = "width";
    // Snapshot geometry once at drag-start so onMove never re-queries the DOM.
    // Flex-fill panels (flex-grow:1, e.g. p-automaton / p-main) absorb the
    // squeeze — their CSS min-width is the hard floor.
    // Rigid panels (flex-shrink:0) won't move at all — their current rendered
    // width is the space they permanently occupy.
    var container = panelEl.parentElement;
    var allHandles = Array.from(container.querySelectorAll(".resize-handle"));
    var handlesTotalW = allHandles.reduce(function (s, h) { return s + h.offsetWidth; }, 0);
    var available = container.offsetWidth - handlesTotalW;
    var siblings = Array.from(container.querySelectorAll(".panel")).filter(function (p) { return p !== panelEl; });
    var minOthers = siblings.reduce(function (s, p) {
      if (p.classList.contains("collapsed")) return s + 22;
      var isFlex = getComputedStyle(p).flexGrow === "1";
      if (isFlex) {
        // Use CSS min-width as the floor (defaults to 60 if unset/auto).
        var cssMin = parseFloat(getComputedStyle(p).minWidth);
        return s + (isNaN(cssMin) || cssMin < 60 ? 60 : cssMin);
      } else {
        // Rigid panel: occupies its full current rendered width regardless.
        return s + Math.max(60, p.getBoundingClientRect().width);
      }
    }, 0);
    var maxW = Math.max(60, available - minOthers);
    var pendingW = null;
    var rafId = null;
    function onMove(cx) {
      pendingW = Math.min(maxW, Math.max(60, startW + sign * (cx - startX)));
      if (rafId) return;
      rafId = requestAnimationFrame(function () {
        rafId = null;
        panelEl.style.width = pendingW + "px";
        if (panelEl.classList.contains("collapsed")) {
          panelEl.classList.remove("collapsed");
          updateCollapseBtn(panelId, false);
        }
      });
    }
    function onEnd() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (pendingW !== null) panelEl.style.width = pendingW + "px";
      handle.classList.remove("dragging");
      panelEl.classList.remove("resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      panelEl.style.willChange = "";
      savePanelState();
      if (typeof renderTree === "function" && document.getElementById("p-tree")) renderTree();
    }
    return { onMove: onMove, onEnd: onEnd };
  }
  handle.addEventListener("mousedown", function (e) {
    var d = startDrag(e.clientX, panelEl.getBoundingClientRect().width);
    function mm(e) {
      d.onMove(e.clientX);
    }
    function mu() {
      d.onEnd();
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    }
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
    e.preventDefault();
  });
  handle.addEventListener(
    "touchstart",
    function (e) {
      var d = startDrag(e.touches[0].clientX, panelEl.getBoundingClientRect().width);
      function tm(e) {
        d.onMove(e.touches[0].clientX);
        e.preventDefault();
      }
      function tu() {
        d.onEnd();
        handle.removeEventListener("touchmove", tm);
        handle.removeEventListener("touchend", tu);
      }
      handle.addEventListener("touchmove", tm, { passive: false });
      handle.addEventListener("touchend", tu);
    },
    { passive: true },
  );
}
// Each tool calls initResize with correct panel IDs and sign after including shared.js

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:BNF-PARSER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function parseBNF(text, augment = true) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));
  if (!lines.length) throw new Error("Empty grammar");
  const rules = [];
  for (const line of lines) {
    const arrow = line.includes("->") ? "->" : line.includes("\u2192") ? "\u2192" : null;
    if (!arrow) throw new Error("Missing '->' in: " + line);
    const [lhs, rhs] = line.split(arrow).map((s) => s.trim());
    if (!lhs) throw new Error("Missing LHS in: " + line);
    for (const alt of rhs.split("|")) {
      const toks = alt.trim().split(/\s+/).filter(Boolean);
      rules.push({
        lhs,
        rhs: toks.length === 1 && ["eps", "epsilon", EPSILON, "''", `""`].includes(toks[0]) ? [] : toks,
      });
    }
  }
  if (!rules.length) throw new Error("No rules found");
  const origStart = rules[0].lhs;
  if (augment) {
    const existingLHS = new Set(rules.map((r) => r.lhs));
    let aug = origStart + "'";
    while (existingLHS.has(aug)) aug += "'";
    rules.unshift({ lhs: aug, rhs: [origStart] });
  }
  const start = rules[0].lhs;
  const nts = new Set(rules.map((r) => r.lhs)),
    terms = new Set();
  for (const r of rules) for (const s of r.rhs) if (!nts.has(s)) terms.add(s);
  terms.add("$");
  return { rules, start, augmented: augment, nonterminals: nts, terminals: terms };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:FIRST-FOLLOW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function firstOfSeq(seq, first) {
  const r = new Set();
  for (const sym of seq) {
    const fs = first[sym] || new Set([sym]);
    for (const s of fs) if (s !== EPSILON) r.add(s);
    if (!fs.has(EPSILON)) return r;
  }
  r.add(EPSILON);
  return r;
}

function computeFirst(g) {
  const { rules, nonterminals: nts, terminals: terms } = g,
    first = {};
  for (const nt of nts) first[nt] = new Set();
  for (const t of terms) first[t] = new Set([t]);
  let ch = true;
  while (ch) {
    ch = false;
    for (const { lhs, rhs } of rules)
      for (const s of firstOfSeq(rhs, first))
        if (!first[lhs].has(s)) {
          first[lhs].add(s);
          ch = true;
        }
  }
  return first;
}

function computeFollow(g, first) {
  const { rules, nonterminals: nts, start } = g,
    follow = {};
  for (const nt of nts) follow[nt] = new Set();
  follow[start].add("$");
  let ch = true;
  while (ch) {
    ch = false;
    for (const { lhs, rhs } of rules)
      for (let i = 0; i < rhs.length; i++) {
        const sym = rhs[i];
        if (!nts.has(sym)) continue;
        const fb = firstOfSeq(rhs.slice(i + 1), first);
        for (const s of fb)
          if (s !== EPSILON && !follow[sym].has(s)) {
            follow[sym].add(s);
            ch = true;
          }
        if (fb.has(EPSILON))
          for (const s of follow[lhs])
            if (!follow[sym].has(s)) {
              follow[sym].add(s);
              ch = true;
            }
      }
  }
  return follow;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:PARSE-TREE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Key difference: LL builds top-down. Nodes are created on
// Expand and leaves confirmed on Match.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let treeRoot = null; // single root node
let treeLastNew = []; // ids highlighted this step

function treeReset() {
  treeRoot = null;
  treeLastNew = [];
  d3.select("#tree-root").selectAll("*").remove();
  document.getElementById("tree-empty").style.display = "";
}

// Called when S' -> S is expanded — create root
function treeInit(symbol, ruleIdx) {
  treeRoot = mkNode(symbol, ruleIdx);
  treeLastNew = [treeRoot.id];
}

let _tNodeId = 0;
function mkNode(symbol, ruleIdx) {
  return { id: _tNodeId++, symbol, ruleIdx, children: [], _placeholder: false };
}

// Expand a nonterminal node: attach children (may include placeholders)
// nodeRef is the actual node object in the tree
function treeExpand(nodeRef, rhs, ruleIdx) {
  nodeRef.ruleIdx = ruleIdx;
  nodeRef.children = rhs.length ? rhs.map((s) => mkNode(s, null)) : [mkNode(EPSILON, null)];
  nodeRef.children.forEach((c) => (c._placeholder = false));
  treeLastNew = nodeRef.children.map((c) => c.id);
}

// Find the leftmost leaf that is a nonterminal (pending expansion)
// or a terminal that hasn't been matched yet.
// We track a pointer into the frontier instead.
// frontier: flat ordered list of leaf nodes ready to be processed.
function buildFrontier(node, out) {
  if (!node) return;
  if (!node.children.length) {
    out.push(node);
    return;
  }
  for (const c of node.children) buildFrontier(c, out);
}

function treeSnapshot() {
  function cl(n) {
    return {
      id: n.id,
      symbol: n.symbol,
      ruleIdx: n.ruleIdx,
      _placeholder: n._placeholder,
      children: n.children.map(cl),
    };
  }
  return { root: treeRoot ? cl(treeRoot) : null, lastNew: [...treeLastNew], nid: _tNodeId };
}
function treeRestore(snap) {
  treeRoot = snap.root;
  treeLastNew = snap.lastNew;
  _tNodeId = snap.nid;
}

const TR = 18,
  TLH = 60,
  TNW = 46;

// renderTree handles the LL(1) parse tree (treeRoot / treeLastNew).
// lr-tool.html intentionally shadows this with its own version for the LR
// bottom-up forest (tForest / tRoots / tLast), which has a different structure.
function renderTree() {
  const svgEl = document.getElementById("tree-svg");
  const root = d3.select("#tree-root");
  const roots = treeRoot ? [treeRoot] : [];
  const lastN = treeLastNew;
  const dr = roots;
  if (!dr.length) {
    const emp = document.getElementById("tree-empty");
    if (emp) emp.style.display = "";
    root.selectAll("*").remove();
    return;
  }
  const emp = document.getElementById("tree-empty");
  if (emp) emp.style.display = "none";

  let lc = 0;
  function aX(n) {
    if (!n.children.length) {
      n._x = lc++ * TNW;
      return;
    }
    n.children.forEach((c) => aX(c));
    n._x = (n.children[0]._x + n.children[n.children.length - 1]._x) / 2;
  }
  const vr = dr.length === 1 ? dr[0] : { id: -1, symbol: "", children: dr };
  aX(vr);

  const nodes = [],
    edges2 = [];
  function col(n) {
    if (n.id !== -1) nodes.push(n);
    n.children.forEach((c) => {
      if (n.id !== -1) edges2.push({ p: n, c });
      col(c);
    });
  }
  col(vr);

  function aD(n, d) {
    n._depth = d;
    n.children.forEach((c) => aD(c, d + 1));
  }
  aD(vr, dr.length === 1 ? 0 : -1);

  const maxD = Math.max.apply(
    null,
    nodes.map((n) => n._depth),
  );
  const BL = maxD * TLH;
  nodes.forEach((n) => {
    n._y = n.children.length ? n._depth * TLH : BL;
  });

  const ns = new Set(lastN);
  if (!nodes.length) return;

  // Render at natural coordinates — _treeZoom handles pan/scale
  root.selectAll("*").remove();
  const g = root.append("g"); // no transform here; zoom owns #tree-root transform

  // Baseline dashed rule under terminal nodes
  const lvs = nodes.filter((n) => !n.children.length);
  if (lvs.length) {
    const lx1 =
      Math.min.apply(
        null,
        lvs.map((n) => n._x),
      ) -
      TR -
      4;
    const lx2 =
      Math.max.apply(
        null,
        lvs.map((n) => n._x),
      ) +
      TR +
      4;
    g.append("line")
      .attr("x1", lx1)
      .attr("y1", BL + TR + 6)
      .attr("x2", lx2)
      .attr("y2", BL + TR + 6)
      .attr("stroke", "var(--border)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4");
  }

  edges2.forEach(({ p, c }) => {
    const ey = p._y + TLH / 2;
    g.append("path")
      .attr("class", "tree-edge" + (ns.has(c.id) ? " new-edge" : ""))
      .attr("d", `M ${c._x},${c._y - TR} L ${c._x},${ey} L ${p._x},${p._y + TR}`);
  });

  nodes.forEach((node) => {
    const gram = typeof currentGrammar !== "undefined" ? currentGrammar : null;
    const isTerm = !gram || !gram.nonterminals.has(node.symbol) || node.symbol === EPSILON;
    const isNew = ns.has(node.id);
    const ng = g
      .append("g")
      .attr("class", "tree-node" + (isTerm ? " terminal" : "") + (isNew ? " new-node" : ""))
      .attr("transform", "translate(" + node._x + "," + node._y + ")");
    ng.append("circle").attr("r", TR);
    ng.append("text")
      .attr("dy", node.ruleIdx !== null ? "-3" : "0")
      .text(node.symbol);
    if (node.ruleIdx !== null)
      ng.append("text")
        .attr("class", "rule-label")
        .attr("dy", "9")
        .text("r" + node.ruleIdx);
  });

  if (typeof fitTree === "function") fitTree();
}

// ── Tree zoom setup (call once from each tool's init) ────────────────────────
// Each tool must call initTreeZoom() after the DOM is ready.
var _treeZoom = null;
function initTreeZoom() {
  _treeZoom = d3
    .zoom()
    .scaleExtent([0.08, 8])
    .wheelDelta(function (e) {
      return -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002);
    })
    .on("zoom", function (e) {
      d3.select("#tree-root").attr("transform", e.transform);
    });
  d3.select("#tree-svg").call(_treeZoom).on("dblclick.zoom", null);
  document.getElementById("tree-svg").addEventListener("dblclick", function () {
    fitTree();
  });
}

function fitTree() {
  if (!_treeZoom) return;
  try {
    var rootEl = document.getElementById("tree-root");
    if (!rootEl) return;
    var bb = rootEl.getBBox();
    var svgEl = document.getElementById("tree-svg");
    var vw = svgEl.clientWidth || 320;
    var vh = svgEl.clientHeight || 400;
    if (!bb || bb.width < 1 || bb.height < 1) return;
    var sc = Math.min(0.95, Math.min(vw / bb.width, vh / bb.height)) * 0.88;
    var tx = (vw - bb.width * sc) / 2 - bb.x * sc;
    var ty = (vh - bb.height * sc) / 2 - bb.y * sc;
    d3.select("#tree-svg").call(_treeZoom.transform, d3.zoomIdentity.translate(tx, ty).scale(sc));
  } catch (e) {}
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:EXAMPLE-GENERATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function generateExample() {
  if (!currentGrammar) return;
  const { rules, nonterminals: nts } = currentGrammar,
    base = {};
  function sh(sym, seen) {
    if (!nts.has(sym)) return [sym];
    if (seen.has(sym)) return null;
    seen.add(sym);
    let best = null;
    for (const r of rules.filter((r) => r.lhs === sym)) {
      let res = [],
        ok = true;
      for (const s of r.rhs) {
        const sub = sh(s, new Set(seen));
        if (!sub) {
          ok = false;
          break;
        }
        res = res.concat(sub);
      }
      if (ok && (!best || res.length < best.length)) best = res;
    }
    return best;
  }
  for (const nt of nts) base[nt] = sh(nt, new Set()) || [];
  const rs = currentGrammar.start,
    TN = 4,
    TX = 12,
    MT = 40;
  function expand() {
    let form = [rs];
    for (let step = 0; step < 60; step++) {
      const np = form.map((s, i) => (nts.has(s) ? i : -1)).filter((i) => i !== -1);
      if (!np.length) break;
      const tc = form.filter((s) => !nts.has(s)).length;
      if (tc >= TX) {
        form = form.flatMap((s) => (nts.has(s) ? base[s] : [s]));
        break;
      }
      const pos = np[Math.floor(Math.random() * Math.min(2, np.length))],
        sym = form[pos];
      const cands = rules.filter((r) => r.lhs === sym);
      if (!cands.length) break;
      let chosen;
      if (tc < TN) {
        const rec = cands.filter((r) => r.rhs.some((s) => nts.has(s)));
        chosen = rec.length ? rec[Math.floor(Math.random() * rec.length)] : cands[Math.floor(Math.random() * cands.length)];
      } else {
        const b2 = cands.filter((r) => r.rhs.every((s) => !nts.has(s)));
        chosen = b2.length && Math.random() < 0.55 ? b2[Math.floor(Math.random() * b2.length)] : cands[Math.floor(Math.random() * cands.length)];
      }
      form.splice(pos, 1, ...chosen.rhs);
      if (form.length > TX * 3) {
        form = form.flatMap((s) => (nts.has(s) ? base[s] : [s]));
        break;
      }
    }
    return form.flatMap((s) => (nts.has(s) ? base[s] || [] : [s]));
  }
  let best = null;
  for (let t = 0; t < MT; t++) {
    const cand = expand().filter((s) => s.length);
    if (!cand.length) continue;
    if (!best) {
      best = cand;
      continue;
    }
    const ok = cand.length >= TN && cand.length <= TX,
      co = best.length >= TN && best.length <= TX;
    if (ok && (!co || cand.length > best.length)) best = cand;
  }
  if (!best || !best.length) {
    setSimLog("Could not generate example", "error");
    return;
  }
  document.getElementById("sim-input").value = best.join(" ");
  simReset();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:PSEUDOCODE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Markup helpers, symbol constants, and pcBlock used by
// all tools' algorithm-popup modals.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function kw(s) { return '<span class="kw">' + s + "</span>"; }
function sym(s) { return '<span class="sym">' + s + "</span>"; }
function it(s) { return '<span class="it">' + s + "</span>"; }
function cm(s) { return '<span class="cm"> ▷ ' + s + "</span>"; }
function hi(s) { return '<span class="hi">' + s + "</span>"; }

const _la  = sym("←");
const _dot = sym("•");
const _ra  = sym("→");
const _eps = sym("ε");
const _in  = sym("∈");
const _nin = sym("∉");
const _neq = sym("≠");
const _emp = sym("∅");
const _cup = sym("∪");

// Build a pseudocode block.
// io: [{label, sym, desc}, ...]  — label shown only on first row of each group
function pcBlock(name, io, body) {
  let prev = null;
  const rows = io
    .map((r) => {
      const show = r.label !== prev;
      prev = r.label;
      return '<span class="pc-io-label">' + (show ? r.label : "") + "</span>" + '<span class="pc-io-sym">' + r.sym + "</span>" + '<span class="pc-io-desc">' + r.desc + "</span>";
    })
    .join("");
  return '<div class="pc-block">' + '<div class="pc-name">' + name + "</div>" + '<div class="pc-io">' + rows + "</div>" + '<div class="pc-body">' + body + "</div>" + "</div>";
}

// Pseudocode block for the First-set algorithm — used by both LR and LL tools.
const PC_FIRST = pcBlock(
  "First",
  [
    { label: "Input", sym: it("X"), desc: "a grammar symbol or a sequence of symbols" },
    {
      label: "Output",
      sym: "First(" + it("X") + ")",
      desc: "the set of terminals t such that " + it("X") + " ⇒* tω for some ω, plus " + _eps + " if " + it("X") + " ⇒* " + _eps,
    },
  ],
  `${kw("if")} X is a terminal
  ${kw("return")} { X }
R ${_la} ${_emp}
${kw("repeat")}
  ${kw("for each")} production X ${_ra} Y₁ Y₂ … Yₖ ${_in} G
    ${kw("for")} i ${_la} 1 to k
      add First(Yᵢ) \\ {${_eps}} to R
      ${kw("if")} ${_eps} ${_nin} First(Yᵢ)  ${kw("break")}${cm("Yᵢ not nullable; remaining symbols cannot contribute")}
    ${kw("if")} all Yᵢ are nullable  add ${_eps} to R
${kw("until")} R is unchanged
${kw("return")} R`,
);

const PC_FOLLOW = pcBlock(
  "Follow",
  [
    { label: "Input", sym: it("G"), desc: "the grammar" },
    { label: "", sym: "First", desc: "the First function" },
    {
      label: "Output",
      sym: "Follow(A)",
      desc: "for each nonterminal A: the set of terminals that can appear immediately to the right of A in a sentential form, plus $ if A can end the input",
    },
  ],
  `Follow(S) ${_la} { $ }${cm("S is the start symbol; $ marks end of input")}
${kw("for each")} other nonterminal A: Follow(A) ${_la} ${_emp}
${kw("repeat")}
  ${kw("for each")} production B ${_ra} Y₁ Y₂ … Yₙ ${_in} G
    ${kw("for")} i ${_la} 1 to n
      ${kw("if")} Yᵢ is a nonterminal
        let β = Yᵢ₊₁ … Yₙ ${cm("the suffix after Yᵢ; empty if i = n")}
        add First(β) \\ {${_eps}} to Follow(Yᵢ)
        ${kw("if")} ${_eps} ${_in} First(β)${cm("suffix is nullable, or Yᵢ is last")}
          add Follow(B) to Follow(Yᵢ)
${kw("until")} all Follow sets are unchanged
${kw("return")} Follow`,
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:EXAMPLES-LOADER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Fetches a JSON examples file and populates a <select> with <optgroup> elements.
// JSON format: { groups: [{ label, examples: [{ value, label, text }] }] }
// examplesObj will have keys added as { text: "..." } entries.
// onReady (optional) is called once the dropdown and examplesObj are populated.
function loadExamplesInto(url, selectId, examplesObj, onReady) {
  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var sel = document.getElementById(selectId);
      if (!sel) return;
      // Remove any previously rendered optgroups (keep the placeholder option)
      Array.from(sel.querySelectorAll("optgroup")).forEach(function (g) { g.remove(); });
      var idx = 0;
      data.groups.forEach(function (group) {
        var og = document.createElement("optgroup");
        og.label = group.label;
        group.examples.forEach(function (ex) {
          var key = "ex" + idx++;
          var opt = document.createElement("option");
          opt.value = key;
          opt.textContent = ex.label;
          og.appendChild(opt);
          examplesObj[key] = { text: Array.isArray(ex.text) ? ex.text.join("\n") : ex.text };
        });
        sel.appendChild(og);
      });
      if (typeof onReady === "function") onReady();
    })
    .catch(function (err) {
      console.error("Failed to load examples from " + url, err);
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Returns true when the algorithm modal is currently visible.
// Use this to guard keyboard shortcuts so they don't fire through the modal.
function isAlgoModalOpen() {
  var o = document.getElementById("algo-overlay");
  return !!(o && !o.classList.contains("hidden"));
}

function closeAlgoModal() {
  document.getElementById("algo-overlay").classList.add("hidden");
}

// Call once at page load. Focuses the close button when the modal opens and
// traps Tab inside it (the close button is the only interactive element).
function initAlgoModal() {
  var overlay = document.getElementById("algo-overlay");
  if (!overlay) return;
  overlay.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    var btn = overlay.querySelector(".algo-close");
    if (btn) btn.focus();
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:SIM-HELPERS
// Shared by LR and LL simulation panels.
// Depend on globals: simTokens, simPos (read-only here).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function tokenise(str) {
  const t = str.trim().split(/\s+/).filter(Boolean);
  t.push("$");
  return t;
}

function renderSimTokens() {
  const el = document.getElementById("sim-tokens");
  el.innerHTML = "";
  simTokens.forEach((t, i) => {
    const s = document.createElement("span");
    s.className = "tok" + (i < simPos ? " consumed" : i === simPos ? " current" : "") + (t === "$" ? " eof" : "");
    s.textContent = t;
    el.appendChild(s);
  });
}

function setSimLog(msg, cls) {
  const el = document.getElementById("sim-log");
  el.textContent = msg;
  el.className = cls || "";
}

// Loads an example grammar. Depends on tool globals: EXAMPLES, setError, build.
function loadExample(k) {
  if (!k) return;
  const ex = EXAMPLES[k];
  if (!ex) return;
  document.getElementById("grammar-input").value = ex.text;
  document.getElementById("examples-select").value = "";
  setError("");
  build();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:TABLE-STEPPER
// Step engine shared by LR (ACTION/GOTO) and LL (M[A,a]).
// Depends on tool globals: tSteps, tStepIdx, tClearStepping,
// tApplySteps (tool-specific DOM query logic).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function tSetLog(html) {
  const bar = document.getElementById("tstep-log-bar");
  bar.innerHTML = html || "";
  bar.style.display = html ? "" : "none";
}

function tSetBtns() {
  const has = tSteps.length > 0;
  document.getElementById("btn-treset").disabled = !has || tStepIdx < 0;
  document.getElementById("btn-tback").disabled  = !has || tStepIdx < 0;
  document.getElementById("btn-tstep").disabled  = !has || tStepIdx >= tSteps.length - 1;
  document.getElementById("btn-trun").disabled   = !has || tStepIdx >= tSteps.length - 1;
}

function tStep() {
  if (tStepIdx >= tSteps.length - 1) return;
  if (tStepIdx === -1) {
    document.querySelectorAll(".parse-table").forEach((t) => t.classList.add("t-stepping"));
  }
  tStepIdx++;
  tApplySteps(tStepIdx);
  tSetLog(tSteps[tStepIdx].html);
  tSetBtns();
}

function tBack() {
  if (tStepIdx < 0) return;
  tStepIdx--;
  if (tStepIdx < 0) {
    tClearStepping();
    tSetLog("Press Table Step ► to begin filling entries.");
  } else {
    tApplySteps(tStepIdx);
    tSetLog(tSteps[tStepIdx].html);
  }
  tSetBtns();
}

function tRunAll() {
  tStepIdx = tSteps.length - 1;
  tClearStepping();
  tSetLog(tSteps[tStepIdx] ? tSteps[tStepIdx].html : "");
  tSetBtns();
}

function tReset() {
  if (tSteps.length === 0) return;
  tStepIdx = -1;
  tClearStepping();
  document.querySelectorAll(".parse-table").forEach((t) => t.classList.add("t-stepping"));
  tSetLog("Press Table Step ► to begin filling entries.");
  tSetBtns();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:UTILITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:TRANS-INPUT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Auto-prepend "q" when the user starts typing a state name in a transition
// table cell.  Attach as onkeydown="transInputKeydown(event)".
//
// Triggers on digits and the letters A/R (the suffix characters used in
// state names like q0, q1, qA, qR) when the cursor is at the start of a
// new token:
//   - always at the very beginning of the field (position 0), and
//   - also right after a ", " separator for cells whose data-trans-type
//     attribute is "states" (NFA cells hold comma-separated state lists).
//     TM cells hold a "nextState, write, dir" triple, so after a comma the
//     user is typing a symbol or direction — no auto-prepend there.
function transInputKeydown(event) {
  if (!/^[0-9aArR]$/.test(event.key)) return;

  var input = event.target;
  var start = input.selectionStart;
  var end   = input.selectionEnd;
  var val   = input.value;
  var before = val.slice(0, start);
  var after  = val.slice(end);

  var isList = input.dataset.transType === "states";
  var atTokenStart = (start === 0) || (isList && /,\s*$/.test(before));
  if (!atTokenStart) return;

  event.preventDefault();
  input.value = before + "q" + event.key + after;
  var newPos = before.length + 2;
  input.setSelectionRange(newPos, newPos);
  // Keep validation in sync
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// HTML-escape a value for safe insertion into DOM content or attributes.
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Render clickable string chips into #examples-chips / #chips-container.
// Shows the bar when strings are present, hides it when empty.
// simFn() is called after the chosen string is written to #sim-string-input.
function renderExampleChips(strings, simFn) {
  var bar       = document.getElementById("examples-chips");
  var container = document.getElementById("chips-container");
  if (!bar || !container) return;
  container.innerHTML = "";
  if (!strings || strings.length === 0) { bar.style.display = "none"; return; }
  bar.style.display = "flex";
  for (var i = 0; i < strings.length; i++) {
    (function(s) {
      var btn = document.createElement("button");
      btn.className   = "example-chip" + (s === "" ? " eps-chip" : "");
      btn.textContent = s === "" ? "ε" : s;
      btn.onclick = function() {
        document.getElementById("sim-string-input").value = s;
        simFn();
      };
      container.appendChild(btn);
    })(strings[i]);
  }
}

// Fetch a grouped examples JSON, populate a <select>, store each example
// into examplesObj keyed as "ex0", "ex1", …, then call loadFn with the
// first key so the tool opens in a meaningful state.
function loadAutomataExamples(url, selectId, examplesObj, loadFn) {
  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var sel = document.getElementById(selectId);
      if (!sel) return;
      var firstKey = null, idx = 0;
      data.groups.forEach(function(group) {
        var og = document.createElement("optgroup");
        og.label = group.label;
        group.examples.forEach(function(ex) {
          var key = "ex" + idx++;
          var opt = document.createElement("option");
          opt.value = key;
          opt.textContent = ex.label;
          og.appendChild(opt);
          examplesObj[key] = ex;
          if (!firstKey) firstKey = key;
        });
        sel.appendChild(og);
      });
      if (firstKey) loadFn(firstKey);
    })
    .catch(function(err) {
      console.error("Failed to load examples from " + url, err);
    });
}
