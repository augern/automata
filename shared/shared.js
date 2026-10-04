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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED:PANEL-LAYOUT
// Panels share #panels in proportion to their weight (CSS --pw, with a minimum
// --pmin), so the whole row scales uniformly with the window. A resize handle
// moves the boundary between its two neighbours. If the minimums don't fit,
// the lowest-priority panels (data-priority) auto-collapse to a strip and come
// back when there is room; the pure logic is in algo/panels.js.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const STORAGE_KEY = "parser-tools-v1";

var _panelStorageKey = STORAGE_KEY;

// Tools with their own storage key call this before loadPanelState(). The panel
// list is read from the DOM, so `ids` is accepted only for compatibility.
function initPanelStorage(key, ids) {
  _panelStorageKey = key;
}

// "-w" = weights; older versions stored pixel widths, which no longer apply.
function _panelKey() {
  return _panelStorageKey + "-w";
}

function _panels() {
  return Array.from(document.querySelectorAll("#panels > .panel"));
}

function _panelWeight(el) {
  const v = parseFloat(getComputedStyle(el).getPropertyValue("--pw"));
  return isNaN(v) ? 300 : v;
}

function _panelMin(el) {
  const v = parseFloat(getComputedStyle(el).getPropertyValue("--pmin"));
  return isNaN(v) ? 180 : v;
}

function _setWeight(el, w) {
  el.style.setProperty("--pw", String(Math.round(w * 100) / 100));
}

// Make every open panel's weight equal its current pixel width, so changing one
// pair afterwards leaves all the others exactly where they are.
function _normaliseWeights() {
  _panels().forEach((el) => {
    if (!el.classList.contains("collapsed")) _setWeight(el, el.getBoundingClientRect().width);
  });
}

function savePanelState() {
  try {
    const s = {};
    _panels().forEach((el) => {
      if (!el.id) return;
      s[el.id] = {
        w: _panelWeight(el),
        collapsed: el.classList.contains("collapsed") && el.dataset.auto !== "1",
      };
    });
    localStorage.setItem(_panelKey(), JSON.stringify(s));
  } catch (e) {}
}

function loadPanelState() {
  try {
    const s = JSON.parse(localStorage.getItem(_panelKey()) || "{}");
    _panels().forEach((el) => {
      const st = s[el.id];
      if (!st) return;
      if (st.w > 0) _setWeight(el, st.w);
      if (st.collapsed) {
        el.classList.add("collapsed");
        el.dataset.locked = "1";
        updateCollapseBtn(el.id, true);
      }
    });
  } catch (e) {}
  try {
    _focusUndo = JSON.parse(localStorage.getItem(_undoKey()) || "null"); // validated lazily by panelFocusedId()
  } catch (e) {
    _focusUndo = null;
  }
  startPanelLayout();
}

// The user's collapse/expand. Collapsing is remembered; expanding makes room by
// collapsing lower-priority panels if the row would otherwise overflow.
function toggleCollapse(id) {
  const el = document.getElementById(id);
  if (el.classList.contains("collapsed")) _expandNow(el);
  else _collapseNow(el);
  _layoutChanged();
}

// Collapse = a chevron pointing at a vertical bar (the panel edge it folds into);
// expand = a double chevron pointing the way the panel will open. Drawn as SVG so
// they look the same in every font; the left-pointing form is mirrored for the other side.
const _ICON_COLLAPSE = '<path d="M3 3v10M12 3.5 7 8l5 4.5"/>';
const _ICON_EXPAND = '<path d="M3.5 3.5 8 8l-4.5 4.5M8.5 3.5 13 8l-4.5 4.5"/>';
function _collapseIcon(collapsed, pointsLeft) {
  // The collapse icon points toward the edge the panel folds into; the expand icon
  // points the opposite way (which way the panel opens). Both are drawn pointing
  // left for collapse and right for expand, and mirrored when needed.
  const flip = collapsed ? pointsLeft : !pointsLeft;
  return '<span class="collapse-btn__glyph"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"' +
    (flip ? ' style="transform: scaleX(-1)"' : "") + ">" + (collapsed ? _ICON_EXPAND : _ICON_COLLAPSE) + "</svg></span>";
}

function updateCollapseBtn(id, collapsed) {
  const el = document.getElementById(id);
  if (!el) return;
  const name = ((el.querySelector(".panel-title") || {}).textContent || "panel").trim();
  const label = (collapsed ? "Expand " : "Collapse ") + name;
  const btn = el.querySelector(".collapse-btn");
  if (btn) {
    const isLeft = el.dataset.collapse === "left";
    // Which way the icon points: a left panel folds left, so collapsing points left and
    // expanding (opening) points right; a right panel is the mirror image.
    const pointsLeft = isLeft ? !collapsed : collapsed;
    btn.innerHTML = _collapseIcon(collapsed, pointsLeft);
    btn.style.setProperty("--dir", pointsLeft ? -1 : 1);
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }
  // A collapsed strip is itself a button.
  const head = el.querySelector(":scope > .panel-header");
  if (head) {
    if (collapsed) {
      head.tabIndex = 0;
      head.setAttribute("role", "button");
      head.setAttribute("aria-label", label);
      head.title = label;
    } else {
      head.removeAttribute("tabindex");
      head.removeAttribute("role");
      head.removeAttribute("aria-label");
      head.removeAttribute("title");
    }
  }
}

// Collapse / expand as the user's own decision (kept across reloads).
function _collapseNow(el) {
  el.classList.add("collapsed");
  el.dataset.locked = "1";
  delete el.dataset.auto;
  delete el.dataset.protect;
  updateCollapseBtn(el.id, true);
}
function _expandNow(el) {
  el.classList.remove("collapsed");
  delete el.dataset.locked;
  delete el.dataset.auto;
  el.dataset.protect = "1"; // opened on purpose: don't auto-collapse it
  updateCollapseBtn(el.id, false);
}
function _panelName(el) {
  return ((el.querySelector(".panel-title") || {}).textContent || el.id).trim();
}
function _layoutChanged() {
  fitPanelLayout();
  savePanelState();
  _panelsChanged();
}

// ── Layout presets (also offered in each tool's View menu) ──
// The panels' designed proportions; everything open.
function panelsResetLayout() {
  _focusUndo = null;
  _saveUndo();
  _panels().forEach((el) => {
    _setWeight(el, parseFloat(el.dataset.pw0) || 300);
    el.classList.remove("collapsed");
    ["locked", "auto", "protect"].forEach((k) => delete el.dataset[k]);
    updateCollapseBtn(el.id, false);
  });
  _layoutChanged();
}
// Every open panel the same width.
function panelsEqualWidths() {
  _focusUndo = null;
  _saveUndo();
  _panels().forEach((el) => { if (!el.classList.contains("collapsed")) _setWeight(el, 100); });
  _layoutChanged();
}
// Open every panel (the row scrolls if they don't all fit).
function panelsExpandAll() {
  _focusUndo = null;
  _saveUndo();
  _panels().forEach((el) => { if (el.classList.contains("collapsed")) _expandNow(el); else el.dataset.protect = "1"; });
  _layoutChanged();
}
// ── Focus on a panel, and undo it ──
// "Focus" collapses every other panel, which is a lot to undo by hand, so the layout
// from before the first focus is remembered (and kept across reloads). While exactly
// that one panel is open, its menu offers "Restore layout" instead of "Focus on this
// panel"; any other change to the layout ends the focused state.
var _focusUndo = null; // { focusId, snapshot: [{ id, w, collapsed, locked, auto, protect }] }

function _undoKey() {
  return _panelKey() + "-undo";
}
function _saveUndo() {
  try {
    if (_focusUndo) localStorage.setItem(_undoKey(), JSON.stringify(_focusUndo));
    else localStorage.removeItem(_undoKey());
  } catch (e) {}
}
function _snapshotLayout() {
  return _panels().map((el) => ({
    id: el.id,
    w: _panelWeight(el),
    collapsed: el.classList.contains("collapsed"),
    locked: el.dataset.locked === "1",
    auto: el.dataset.auto === "1",
    protect: el.dataset.protect === "1",
  }));
}
function _applySnapshot(snapshot) {
  snapshot.forEach((st) => {
    const el = document.getElementById(st.id);
    if (!el) return;
    _setWeight(el, st.w);
    el.classList.toggle("collapsed", st.collapsed);
    ["locked", "auto", "protect"].forEach((k) => { if (st[k]) el.dataset[k] = "1"; else delete el.dataset[k]; });
    updateCollapseBtn(el.id, st.collapsed);
  });
}

// The focused panel's id while the layout is still the focused one, else null.
function panelFocusedId() {
  if (!_focusUndo) return null;
  const sole = soleOpenPanel(_panels().map((el) => ({ id: el.id, collapsed: el.classList.contains("collapsed") })));
  if (sole && sole === _focusUndo.focusId) return sole;
  _focusUndo = null; // the layout was changed by hand: nothing left to undo
  _saveUndo();
  return null;
}

// Show one panel at full width; the rest become strips you can click to reopen.
function panelFocus(id) {
  if (!panelFocusedId()) _focusUndo = { focusId: id, snapshot: _snapshotLayout() };
  else _focusUndo.focusId = id; // refocusing keeps the original layout to return to
  _saveUndo();
  _panels().forEach((el) => { if (el.id === id) { if (el.classList.contains("collapsed")) _expandNow(el); else el.dataset.protect = "1"; } else if (!el.classList.contains("collapsed")) _collapseNow(el); });
  _layoutChanged();
}
// Undo panelFocus: the panels exactly as they were before.
function panelRestoreFocus() {
  if (!panelFocusedId()) return;
  _applySnapshot(_focusUndo.snapshot);
  _focusUndo = null;
  _saveUndo();
  _layoutChanged();
}
function panelSummaries() {
  const focused = panelFocusedId();
  return _panels().map((el) => ({ id: el.id, title: _panelName(el), collapsed: el.classList.contains("collapsed"), focused: el.id === focused }));
}

// Each panel header's secondary buttons (Algorithm, view toggles...) move into
// a "…" menu, next to the standard panel actions; the original buttons stay in
// the DOM (hidden) so existing handlers and state keep working.
function installPanelMenus() {
  if (typeof UI === "undefined") return;
  _panels().forEach((el) => {
    const head = el.querySelector(":scope > .panel-header");
    if (!head || head.querySelector(".panel-menu")) return;
    const sources = Array.from(head.querySelectorAll(":scope > .algo-btn"));
    sources.forEach((b) => b.classList.add("panel-menu-source"));
    const kebab = document.createElement("button");
    kebab.type = "button";
    kebab.className = "ui-menu-btn panel-menu";
    kebab.textContent = "⋯";
    kebab.title = "Panel menu";
    kebab.setAttribute("aria-label", "Menu for " + _panelName(el));
    kebab.addEventListener("click", (e) => e.stopPropagation());
    head.insertBefore(kebab, head.querySelector(".collapse-btn"));
    UI.menu(kebab, () => {
      const items = sources.map((b) => ({
        label: b.textContent.trim(),
        title: b.title,
        checked: b.classList.contains("min-toggle") ? b.classList.contains("active") : undefined,
        onSelect: () => b.click(),
      }));
      if (items.length) items.push({ separator: true });
      if (panelFocusedId() === el.id) {
        items.push({ label: "Restore layout", hint: "F", title: "Undo \"Focus on this panel\": bring back the panels as they were", onSelect: panelRestoreFocus });
      } else {
        items.push({ label: "Focus on this panel", hint: "F", title: "Show only this panel; Restore layout undoes it", onSelect: () => panelFocus(el.id) });
      }
      if (el.querySelector(".collapse-btn")) items.push({ label: "Collapse panel", onSelect: () => toggleCollapse(el.id) });
      return items;
    });
  });
}

// ── Key focus: which panel the arrow keys step ───────────────────────────
// Every panel that has a stepper (Back / Step / Reset / Run-all) registers it:
//   registerStepper("p-sim", { step: simStepFwd, back: simBack, reset: simReset, end: simRunAll });
// Exactly one registered panel has "key focus" at a time: its header is tinted and
// the keys act on it (see stepperKeyAction in algo/panels.js). Focus moves when you
// click or Tab into another stepping panel, or press T. A tool with one stepper
// never needs to think about any of this.
const _steppers = new Map();
var _keyPanelId = null;
var _lastPanelId = null; // the panel you last clicked or tabbed into, with or without a stepper
var _keyFocusInstalled = false;

function registerStepper(panelId, actions, opts) {
  _steppers.set(panelId, actions);
  _installKeyFocus();
  if (_keyPanelId === null || (opts && opts.primary)) setKeyPanel(panelId, true);
}

function _stepperPanelIds() {
  return _panels().map((el) => el.id).filter((id) => _steppers.has(id));
}

function setKeyPanel(id, force) {
  if (!_steppers.has(id) || (_keyPanelId === id && !force)) return;
  if (document.getElementById(id).classList.contains("collapsed")) return;
  _keyPanelId = id;
  _panels().forEach((el) => el.classList.toggle("has-key-focus", el.id === id));
}

function keyPanelSummaries() {
  return _stepperPanelIds().map((id) => {
    const el = document.getElementById(id);
    return { id, title: _panelName(el), keyFocus: id === _keyPanelId, collapsed: el.classList.contains("collapsed") };
  });
}

// A collapsed panel cannot have key focus: it loses its tint, and the keys go to the
// next open stepping panel (or to none when every stepping panel is collapsed).
// Runs whenever a panel's class changes, so every way of collapsing is covered.
function _syncKeyFocus() {
  const isOpen = (id) => !document.getElementById(id).classList.contains("collapsed");
  if (_keyPanelId !== null && !isOpen(_keyPanelId)) {
    const ids = _stepperPanelIds();
    const open = ids.filter(isOpen);
    const next = open.find((id) => ids.indexOf(id) > ids.indexOf(_keyPanelId)) || open[0] || null;
    _keyPanelId = next;
    _panels().forEach((el) => el.classList.toggle("has-key-focus", el.id === next));
  } else if (_keyPanelId === null) {
    const first = _stepperPanelIds().find(isOpen);
    if (first) setKeyPanel(first);
  }
}

function _installKeyFocus() {
  if (_keyFocusInstalled) return;
  _keyFocusInstalled = true;
  if (typeof MutationObserver !== "undefined") {
    const watch = new MutationObserver(_syncKeyFocus);
    _panels().forEach((el) => watch.observe(el, { attributes: true, attributeFilter: ["class"] }));
    _syncKeyFocus();
  }
  const claim = (e) => {
    const panel = e.target.closest && e.target.closest("#panels > .panel");
    if (!panel) return;
    _lastPanelId = panel.id;
    setKeyPanel(panel.id); // no-op unless the panel has a stepper
  };
  document.addEventListener("pointerdown", claim, true);
  document.addEventListener("focusin", claim);
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return; // e.g. a resize handle took the arrow key
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector(".ui-menu")) return;
    if (typeof isAlgoModalOpen === "function" && isAlgoModalOpen()) return;
    if (document.querySelector("#guide-overlay:not(.hidden)")) return;
    const action = stepperKeyAction(e);
    if (!action) return;
    e.preventDefault();
    if (action === "focus-panel") {
      // F toggles: undo the focus if the layout is focused, else focus the tinted
      // (key-focus) panel, falling back to the panel you last used.
      if (panelFocusedId()) panelRestoreFocus();
      else {
        const target = _keyPanelId || _lastPanelId || (document.querySelector("#panels > .panel:hover") || {}).id;
        if (target) panelFocus(target);
      }
      return;
    }
    if (action === "next-panel" || action === "prev-panel") {
      setKeyPanel(nextKeyPanel(_stepperPanelIds().filter((id) => !document.getElementById(id).classList.contains("collapsed")), _keyPanelId, action === "next-panel" ? 1 : -1));
      return;
    }
    const stepper = _steppers.get(_keyPanelId);
    if (stepper && stepper[action]) stepper[action]();
  });
}

// Charts that draw into a sized container re-render after the layout moves.
function _panelsChanged() {
  if (typeof renderTree === "function" && document.getElementById("p-tree")) renderTree();
}

// Collapse or re-expand panels automatically so that every open panel keeps
// its minimum width (see fitPanels in algo/panels.js).
function fitPanelLayout() {
  const row = document.getElementById("panels");
  if (!row) return false;
  const panels = _panels();
  const handles = Array.from(row.querySelectorAll(".resize-handle")).reduce((n, h) => n + h.offsetWidth, 0);
  const info = panels.map((el) => ({
    min: _panelMin(el),
    collapsed: el.classList.contains("collapsed"),
    auto: el.dataset.auto === "1",
    locked: el.dataset.locked === "1" || el.dataset.protect === "1",
    priority: parseFloat(el.dataset.priority) || 0,
  }));
  const r = fitPanels(info, row.clientWidth - handles);
  r.collapse.forEach((i) => {
    panels[i].classList.add("collapsed");
    panels[i].dataset.auto = "1";
    updateCollapseBtn(panels[i].id, true);
  });
  r.expand.forEach((i) => {
    panels[i].classList.remove("collapsed");
    delete panels[i].dataset.auto;
    updateCollapseBtn(panels[i].id, false);
  });
  return r.collapse.length + r.expand.length > 0;
}

var _panelObserver = null;
function startPanelLayout() {
  const row = document.getElementById("panels");
  if (!row || _panelObserver) return;
  // A click, or Enter/Space, on a collapsed strip opens it.
  const openStrip = (e) => {
    const head = e.target.closest(".panel.collapsed > .panel-header");
    if (head && head.parentElement.parentElement === row) {
      e.preventDefault();
      toggleCollapse(head.parentElement.id);
    }
  };
  row.addEventListener("click", openStrip);
  row.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".panel.collapsed > .panel-header")) openStrip(e);
  });
  _panels().forEach((el) => updateCollapseBtn(el.id, el.classList.contains("collapsed")));
  if (typeof ResizeObserver !== "undefined") {
    let raf = null;
    _panelObserver = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        if (fitPanelLayout()) _panelsChanged();
      });
    });
    _panelObserver.observe(row);
  }
  installPanelMenus();
  _installKeyFocus();
  fitPanelLayout();
}

// Wire a resize handle. The handle moves the boundary between the panel before
// it and the panel after it (panelId and sign are accepted for compatibility).
function initResize(hid) {
  const handle = document.getElementById(hid);
  if (!handle) return;
  const left = handle.previousElementSibling;
  const right = handle.nextElementSibling;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", "Resize panels");
  handle.setAttribute("title", "Drag to resize · double-click to reset");
  handle.tabIndex = 0;
  // Remember the designed weights for double-click reset.
  [left, right].forEach((el) => { if (!el.dataset.pw0) el.dataset.pw0 = String(_panelWeight(el)); });

  // Set up a drag/keyboard session: returns start widths and minimums. A
  // collapsed neighbour is opened at its minimum width first.
  function begin() {
    [left, right].forEach((el) => {
      if (!el.classList.contains("collapsed")) return;
      el.classList.remove("collapsed");
      delete el.dataset.auto;
      delete el.dataset.locked;
      el.dataset.protect = "1";
      updateCollapseBtn(el.id, false);
    });
    _normaliseWeights();
    const wL = left.getBoundingClientRect().width;
    const wR = right.getBoundingClientRect().width;
    const sess = { widthL: wL, widthR: wR, minL: _panelMin(left), minR: _panelMin(right) };
    // If a panel was just opened it may be thin; start it at its minimum.
    if (sess.widthL < sess.minL) { sess.widthR -= sess.minL - sess.widthL; sess.widthL = sess.minL; }
    if (sess.widthR < sess.minR) { sess.widthL -= sess.minR - sess.widthR; sess.widthR = sess.minR; }
    return sess;
  }
  // Dragging well past a panel's minimum collapses it (and back again if you
  // drag back); panels without a collapse button just stop at the minimum.
  function apply(sess, dx) {
    const r = panelDrag({ ...sess, dx, canCollapseL: !!left.querySelector(".collapse-btn"), canCollapseR: !!right.querySelector(".collapse-btn") });
    if (r.collapse) {
      const gone = r.collapse === "left" ? left : right;
      const kept = r.collapse === "left" ? right : left;
      if (!gone.classList.contains("collapsed")) _collapseNow(gone);
      sess.dragCollapsed = gone;
      _setWeight(kept, sess.widthL + sess.widthR - PANEL_COLLAPSED_W);
      return;
    }
    if (sess.dragCollapsed && sess.dragCollapsed.classList.contains("collapsed")) _expandNow(sess.dragCollapsed);
    sess.dragCollapsed = null;
    _setWeight(left, r.left);
    _setWeight(right, r.right);
  }
  function finish() {
    savePanelState();
    _panelsChanged();
  }

  function startDrag(startX) {
    const sess = begin();
    const row = handle.parentElement;
    handle.classList.add("dragging");
    row.classList.add("resizing");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    let pendingDx = 0;
    let rafId = null;
    function onMove(cx) {
      pendingDx = cx - startX;
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = null; apply(sess, pendingDx); });
    }
    function onEnd() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      apply(sess, pendingDx);
      handle.classList.remove("dragging");
      row.classList.remove("resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      finish();
    }
    return { onMove, onEnd };
  }

  handle.addEventListener("mousedown", function (e) {
    const d = startDrag(e.clientX);
    function mm(ev) { d.onMove(ev.clientX); }
    function mu() {
      d.onEnd();
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    }
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
    e.preventDefault();
    handle.focus();
  });
  handle.addEventListener("touchstart", function (e) {
    const d = startDrag(e.touches[0].clientX);
    function tm(ev) { d.onMove(ev.touches[0].clientX); ev.preventDefault(); }
    function tu() {
      d.onEnd();
      handle.removeEventListener("touchmove", tm);
      handle.removeEventListener("touchend", tu);
    }
    handle.addEventListener("touchmove", tm, { passive: false });
    handle.addEventListener("touchend", tu);
  }, { passive: true });

  // Arrow keys nudge the boundary (Shift = larger steps).
  handle.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = (e.shiftKey ? 96 : 24) * (e.key === "ArrowLeft" ? -1 : 1);
    apply(begin(), step);
    finish();
  });

  // Double-click: give the two panels back their designed proportions.
  handle.addEventListener("dblclick", function () {
    const sess = begin();
    const d0L = parseFloat(left.dataset.pw0), d0R = parseFloat(right.dataset.pw0);
    const total = sess.widthL + sess.widthR;
    apply(sess, (total * d0L) / (d0L + d0R) - sess.widthL);
    finish();
  });
}
// Each tool calls initResize(handleId) for every .resize-handle after including shared.js

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
// SHARED:EXAMPLE-GENERATOR (LL/LR sentence input)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function randomSentence() {
  const s = currentGrammar ? grammarRandomSentence(currentGrammar, Math.random, { minTerms: 1 + Math.floor(Math.random() * 5), maxTerms: 10 }) : null;
  return s ? s.join(" ") : null;
}
// A few distinct random sentences for the examples menu.
function sampleSentences(n) {
  const seen = new Set();
  for (let i = 0; i < n * 4 && seen.size < n; i++) {
    const s = randomSentence();
    if (s !== null) seen.add(s);
  }
  return [...seen].sort((a, b) => a.length - b.length);
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
    document.querySelectorAll(".parse-table").forEach((t) => t.classList.add("is-stepping"));
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
  document.querySelectorAll(".parse-table").forEach((t) => t.classList.add("is-stepping"));
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

// Fetch a grouped examples JSON, populate a <select>, store each example
// into examplesObj keyed as "ex0", "ex1", …, then call loadFn with the
// first key so the tool opens in a meaningful state.
// shouldLoadFirst (optional): called once the examples are in; return false to skip loading the
// first example (e.g. because the page was restored from a shareable link).
function loadAutomataExamples(url, selectId, examplesObj, loadFn, shouldLoadFirst) {
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
      if (firstKey && (!shouldLoadFirst || shouldLoadFirst())) loadFn(firstKey);
    })
    .catch(function(err) {
      console.error("Failed to load examples from " + url, err);
    });
}
