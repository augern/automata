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
var panelMenuExtras = {};
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
      // items a tool or shared code adds to one panel's menu: panelMenuExtras[panelId] = () => [menu items]
      const extra = panelMenuExtras[el.id] ? panelMenuExtras[el.id]() : [];
      if (extra.length) items.push(...(items.length ? [{ separator: true }] : []), ...extra);
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
  // A click on an open panel's header (outside its buttons) collapses it.
  const openStrip = (e) => {
    const head = e.target.closest(".panel > .panel-header");
    if (!head || head.parentElement.parentElement !== row) return;
    const panel = head.parentElement;
    if (!panel.classList.contains("collapsed")) {
      const inner = e.target.closest("button, a, input, select, textarea, label, .ui-menu");
      if (inner || !panel.querySelector(".collapse-btn") || (window.getSelection && String(window.getSelection()))) return;
    }
    e.preventDefault();
    toggleCollapse(panel.id);
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
  // The panels this handle resizes: the nearest open panel on each side (a collapsed panel stays collapsed).
  let left = handle.previousElementSibling;
  let right = handle.nextElementSibling;
  function pick() {
    const ps = _panels();
    const before = ps.filter((p) => handle.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_PRECEDING).length;
    const n = panelHandleNeighbours(ps.map((p) => p.classList.contains("collapsed")), before - 1);
    if (!n) return false;
    left = ps[n[0]];
    right = ps[n[1]];
    return true;
  }
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", "Resize panels");
  handle.setAttribute("title", "Drag to resize · double-click to reset");
  handle.tabIndex = 0;
  // Remember the designed weights for double-click reset.
  _panels().forEach((el) => { if (!el.dataset.pw0) el.dataset.pw0 = String(_panelWeight(el)); });

  // Set up a drag/keyboard session: returns start widths and minimums. A
  // collapsed neighbour is opened at its minimum width first.
  function begin() {
    if (!pick()) return null;
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
    if (!sess) return null;
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
    if (!d) return;
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
    if (!d) return;
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
    const sess = begin();
    if (!sess) return;
    apply(sess, step);
    finish();
  });

  // Double-click: give the two panels back their designed proportions.
  handle.addEventListener("dblclick", function () {
    const sess = begin();
    if (!sess) return;
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

// ── Parse-tree layout, shared by every tree view ───────────────────────────────────────────────────────────
// A tree is { id, children: [...], ... } (the forest of an LR run has a virtual root with id -1). The views draw
// each node as a pill and call, in this order:
//   const dir = treeChooseDir(vr, nodes, o);  treePlace(vr, nodes, dir, o);   // sets n._x, n._y, n._w, n._half
//   treeBaseline(g, nodes, dir);  treeEdgePath(p, c, dir)  (and treeEdgeLabelPos for labels on edges)
// Options o: width(n) the node's width (default: from n.symbol), half the node's half height (18), row the
// distance between levels top-down (60), align false to place leaves at their own depth instead of on a common
// line (a search tree whose leaves are not all terminals).
// Two directions: "down" (root on top) and "side" (root on the left, children to its right); the leaves are on one
// line at the bottom or in one column on the right, right-aligned, marked by a dashed rule that ends in an arrow in
// the reading order.

// Width of a parse-tree node for its label: at least a circle, wider for long names such as <adjective>.
function treeNodeW(sym) {
  return Math.max(2 * TR, Math.ceil([...String(sym)].length * 6.6) + 16);
}

var treeDirMode = "auto"; // auto | down | side
try { treeDirMode = localStorage.getItem("parser-tools-treedir") || "auto"; } catch (e) { /* storage blocked */ }
var _treeDir = "down";
var _treeRedraw = []; // the redraw functions of the trees on this page
function setTreeDirMode(m) {
  treeDirMode = m;
  try { localStorage.setItem("parser-tools-treedir", m); } catch (e) { /* storage blocked */ }
  _treeRedraw.forEach((f) => f());
}
// A tree view on the page: its panel's menu offers the direction, and a resized pane redraws it when the
// automatic direction would change. enabled(): the menu offers the choice only when this is true (default: always).
function treeRegisterPanel(panelId, svgId, redraw, enabled) {
  _treeRedraw.push(redraw);
  panelMenuExtras[panelId] = function () {
    if (enabled && !enabled()) return [];
    return [
      { heading: "Tree direction" },
      { label: "Automatic", checked: treeDirMode === "auto", title: "Top-down, or sideways when that fits the pane better", onSelect: () => setTreeDirMode("auto") },
      { label: "Top-down", checked: treeDirMode === "down", onSelect: () => setTreeDirMode("down") },
      { label: "Sideways", checked: treeDirMode === "side", title: "Root on the left, children to its right", onSelect: () => setTreeDirMode("side") },
    ];
  };
  if (typeof ResizeObserver === "undefined") return;
  var timer = null;
  new ResizeObserver(function () {
    clearTimeout(timer);
    timer = setTimeout(function () { if (treeDirMode === "auto") redraw(); }, 200);
  }).observe(document.getElementById(svgId).parentElement);
}

// Horizontal positions (_x) of a forest under the virtual root vr: d3's tidy tree, siblings and cousins kept apart
// by the widths of their nodes (n._w). With `align`, the leaves are drawn on one line whatever their depth, so each
// leaf is given zero-width placeholders down to the deepest row: the tidy tree then keeps all leaves apart.
function treeLayoutX(vr, align) {
  let maxD = 0;
  (function depth(n, d) { maxD = Math.max(maxD, d); n.children.forEach((c) => depth(c, d + 1)); })(vr, 0);
  const wrap = (n, d) => {
    const w = n.id === -1 ? 0 : n._w;
    if (n.children.length) return { n, w, kids: n.children.map((c) => wrap(c, d + 1)) };
    let node = { n, w, kids: [] };
    if (align) for (let k = d; k < maxD; k++) node = { n: null, w: 0, kids: [node] };
    return node;
  };
  const h = d3.hierarchy(wrap(vr, 0), (x) => x.kids);
  d3.tree().nodeSize([1, 1]).separation((a, b) => (a.data.w + b.data.w) / 2 + 10)(h);
  h.each((d) => { if (d.data.n) d.data.n._x = d.x; });
}

// Sets n._x, n._y (and _w, _half, _row) of every node of the forest (vr is the virtual root or the root, nodes the
// real ones) for direction dir; returns { w, h }, the extent of the drawing.
function treePlace(vr, nodes, dir, o) {
  o = o || {};
  const half = o.half === undefined ? TR : o.half, row = o.row || TLH, align = o.align !== false;
  const W = o.width || ((n) => treeNodeW(n.symbol));
  nodes.forEach((n) => { n._w = W(n); n._half = half; n._row = row; });
  if (vr.id === -1) vr._w = 0;
  const depthOf = new Map();
  (function dd(n, d) { depthOf.set(n, d); n.children.forEach((c) => dd(c, d + 1)); })(vr, vr.id === -1 ? -1 : 0);
  nodes.forEach((n) => { n._depth = depthOf.get(n); });
  const maxD = Math.max.apply(null, nodes.map((n) => n._depth));
  if (dir === "down") {
    treeLayoutX(vr, align);
    const BL = maxD * row;
    nodes.forEach((n) => { n._y = !align || n.children.length ? n._depth * row : BL; });
    const xs = nodes.map((n) => n._x);
    return { w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + 80, h: BL + 2 * half };
  }
  // sideways: the leaves in order, one row each; a parent in the middle of its children; a column per depth
  const RH = 2 * half + 8;
  let rowNo = 0;
  (function ay(n) {
    if (!n.children.length) { n._y = rowNo++ * RH; return; }
    n.children.forEach(ay);
    n._y = (n.children[0]._y + n.children[n.children.length - 1]._y) / 2;
  })(vr);
  const colW = [];
  nodes.forEach((n) => { if (n.children.length || !align) colW[n._depth] = Math.max(colW[n._depth] || 0, n._w); });
  const leafW = Math.max.apply(null, nodes.filter((n) => !n.children.length).map((n) => n._w).concat([2 * half]));
  const GAP = 36;
  const x0 = [];
  let x = 0;
  for (let d = 0; d <= maxD; d++) {
    const w = colW[d] || 0;
    x0[d] = x + w / 2;
    x += w + (w ? GAP : 0);
  }
  // with `align`, the leaves are right-aligned in a column after the last internal column
  const right = align ? x + leafW : x - GAP;
  nodes.forEach((n) => { n._x = n.children.length || !align ? x0[n._depth] : right - n._w / 2; });
  return { w: right, h: rowNo * RH };
}

// Which direction for this tree in the pane (svgId: its <svg>)? Both are laid out and compared by the scale at
// which they fit; the current one is kept unless the other is clearly better (15 %); a tie goes to top-down.
function treeChooseDir(vr, nodes, o, svgId) {
  if (treeDirMode === "down" || treeDirMode === "side") { _treeDir = treeDirMode === "side" ? "side" : "down"; return _treeDir; }
  const svg = document.getElementById(svgId || "tree-svg");
  const vw = svg ? svg.clientWidth : 0, vh = svg ? svg.clientHeight : 0;
  if (!vw || !vh) return _treeDir;
  const fit = (dir) => { const e = treePlace(vr, nodes, dir, o); return Math.min(1, (vw - 48) / Math.max(e.w, 1), (vh - 48) / Math.max(e.h, 1)); };
  const sd = fit("down"), ss = fit("side");
  const cur = _treeDir, other = cur === "down" ? "side" : "down";
  const sc = { down: sd, side: ss };
  _treeDir = sc[other] > sc[cur] * 1.15 ? other : cur;
  return _treeDir;
}

// The edge from parent p to child c, as an SVG path, for direction dir. Siblings fan out together: a stub from
// the child to a point shared by all siblings, then a straight line to the parent.
function treeEdgePath(p, c, dir) {
  if (dir === "side") {
    const x1 = p._x + p._w / 2, x2 = c._x - c._w / 2, xm = Math.min(x1 + 18, x2);
    return `M ${x2},${c._y} L ${xm},${c._y} L ${x1},${p._y}`;
  }
  const ey = p._y + p._row / 2;
  return `M ${c._x},${c._y - c._half} L ${c._x},${ey} L ${p._x},${p._y + p._half}`;
}
// Where to put a short label on that edge (for example the number of an alternative): on the stub into the child.
function treeEdgeLabelPos(p, c, dir) {
  if (dir === "side") {
    const x1 = p._x + p._w / 2, x2 = c._x - c._w / 2, xm = Math.min(x1 + 18, x2);
    return { x: (xm + x2) / 2, y: c._y - 7 };
  }
  const ey = p._y + p._row / 2;
  return { x: c._x + 8, y: (c._y - c._half + Math.max(ey, c._y - c._half - 20)) / 2 };
}

// The dashed rule that marks the terminals (a line under them, or a vertical line after them), with an arrowhead
// in the reading order.
function treeBaseline(g, nodes, dir) {
  const lvs = nodes.filter((n) => !n.children.length);
  if (!lvs.length) return;
  // an arrowhead at the end shows the reading order of the terminals (left to right, or top to bottom)
  const svg = d3.select(g.node().ownerSVGElement);
  if (svg.select("#tree-read-arrow").empty()) {
    (svg.select("defs").empty() ? svg.insert("defs", ":first-child") : svg.select("defs")).append("marker")
      .attr("id", "tree-read-arrow").attr("markerUnits", "userSpaceOnUse").attr("markerWidth", 10).attr("markerHeight", 8)
      .attr("refX", 8).attr("refY", 4).attr("orient", "auto")
      .append("path").attr("d", "M0,0 L9,4 L0,8 z").attr("fill", "var(--text-lo)");
  }
  const line = g.append("line").attr("stroke", "var(--border-hi)").attr("stroke-width", 1).attr("stroke-dasharray", "4,4").attr("marker-end", "url(#tree-read-arrow)");
  if (dir === "side") {
    const x = Math.max.apply(null, lvs.map((n) => n._x + n._w / 2)) + 8;
    const ys = lvs.map((n) => n._y), half = lvs[0]._half;
    line.attr("x1", x).attr("x2", x).attr("y1", Math.min.apply(null, ys) - half).attr("y2", Math.max.apply(null, ys) + half + 14);
  } else {
    const lx1 = Math.min.apply(null, lvs.map((n) => n._x - n._w / 2)) - 4;
    const lx2 = Math.max.apply(null, lvs.map((n) => n._x + n._w / 2)) + 4;
    const y = lvs[0]._y + lvs[0]._half + 6;
    line.attr("x1", lx1).attr("y1", y).attr("x2", lx2 + 14).attr("y2", y);
  }
}

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

  const vr = dr.length === 1 ? dr[0] : { id: -1, symbol: "", children: dr };

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

  const dir = treeChooseDir(vr, nodes);
  treePlace(vr, nodes, dir);

  const ns = new Set(lastN);
  if (!nodes.length) return;

  // Render at natural coordinates — the tree view handles pan/scale
  root.selectAll("*").remove();
  const g = root.append("g"); // no transform here; zoom owns #tree-root transform

  treeBaseline(g, nodes, dir);

  edges2.forEach(({ p, c }) => {
    g.append("path")
      .attr("class", "tree-edge" + (ns.has(c.id) ? " new-edge" : ""))
      .attr("d", treeEdgePath(p, c, dir));
  });

  nodes.forEach((node) => {
    const gram = typeof currentGrammar !== "undefined" ? currentGrammar : null;
    const isTerm = !gram || !gram.nonterminals.has(node.symbol) || node.symbol === EPSILON;
    const isNew = ns.has(node.id);
    const ng = g
      .append("g")
      .attr("class", "tree-node" + (isTerm ? " terminal" : "") + (isNew ? " new-node" : ""))
      .attr("transform", "translate(" + node._x + "," + node._y + ")");
    const nw = treeNodeW(node.symbol);
    ng.append("rect").attr("class", "tn-shape").attr("x", -nw / 2).attr("y", -TR).attr("width", nw).attr("height", 2 * TR).attr("rx", TR);
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

// ── Tree view (call initTreeZoom once from each tool's init) ─────────────────
// Pan/zoom for #tree-svg; fitTree() fits the tree into the view (see fit-view.js).
var _treeView = null;
function initTreeZoom() {
  _treeView = createFitView({
    svg: "tree-svg", root: "tree-root", scaleExtent: [0.08, 8], maxScale: 0.95, pad: 24,
    hasContent: function () { return typeof treeRoot !== "undefined" && !!treeRoot; },
  });
  treeRegisterPanel("p-tree", "tree-svg", function () { if (typeof renderTree === "function") renderTree(); });
}

function fitTree() {
  if (_treeView) _treeView.refit();
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
// examplesObj gets one entry per example: its JSON fields, with text joined into one string.
// onReady (optional) is called once the dropdown and examplesObj are populated.
// Replace an examples <select> by a button that opens a menu: examples grouped under their
// headings, each with its one-line purpose as a tooltip (native option tooltips are not shown
// by every browser). The <select> stays in the page, hidden, as the place tools read and set the
// current example, so existing code that uses it keeps working.
//   groups: [{ label, items: [{ key, label, purpose }] }]
function upgradeExamplesSelect(sel, groups) {
  sel._exGroups = groups;
  if (sel._exBtn || typeof UI === "undefined") return;
  var placeholder = sel.options.length ? sel.options[0].textContent : "Examples";
  var btn = document.createElement("button");
  btn.type = "button";
  btn.id = "examples-btn";
  btn.className = "ui-select ui-select--grow examples-btn";
  btn.innerHTML = "<span></span>";
  sel.parentNode.insertBefore(btn, sel);
  sel.hidden = true;
  sel._exBtn = btn;
  function sync() {
    var cur = null;
    sel._exGroups.forEach(function (g) { g.items.forEach(function (it) { if (it.key === sel.value) cur = it; }); });
    btn.firstChild.textContent = cur ? cur.label : placeholder;
    btn.title = cur && cur.purpose ? cur.purpose : "";
  }
  // Tools set the current example with `select.value = key`: follow that.
  var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  Object.defineProperty(sel, "value", {
    get: function () { return desc.get.call(this); },
    set: function (v) { desc.set.call(this, v); sync(); },
  });
  sel.addEventListener("change", sync);
  UI.menu(btn, function () {
    var items = [];
    sel._exGroups.forEach(function (g) {
      items.push({ heading: g.label });
      g.items.forEach(function (it) {
        items.push({
          label: it.label,
          title: it.purpose || undefined,
          checked: it.key === sel.value ? true : undefined,
          onSelect: function () { sel.value = it.key; sel.dispatchEvent(new Event("change")); },
        });
      });
    });
    return items;
  }, { align: "left" });
  sync();
}

// ── Quick links (QR code): the loaded example and the panel set, see quickEncode in algo/share.js ──
// The example loader of a tool is wrapped so the key of the last example loaded is known.
var _currentExampleKey = null;
function _trackExample(fnName) {
  var f = window[fnName];
  if (typeof f !== "function" || f._tracked) return;
  var w = function (k) { if (k && typeof k === "string") _currentExampleKey = k; return f.apply(this, arguments); };
  w._tracked = true;
  window[fnName] = w;
}
function quickLinkUrl() {
  var key = _currentExampleKey, n = key && /^ex(\d+)$/.test(key) ? +key.slice(2) : null;
  return location.origin + location.pathname + "#" + quickEncode(n, _panels().map(function (el) { return el.classList.contains("collapsed"); }));
}
// Run once the examples are loaded: load the example and set the panels a quick link names.
function quickLinkApply(fnName) {
  var q = quickDecode(location.hash);
  if (!q) return;
  var f = window[fnName];
  if (q.example !== null && typeof f === "function") { try { f("ex" + q.example); } catch (e) {} }
  var ps = _panels();
  if (q.collapsed.length === ps.length) {
    ps.forEach(function (el, i) {
      var want = q.collapsed[i];
      if (want && !el.classList.contains("collapsed")) _collapseNow(el);
      else if (!want && el.classList.contains("collapsed")) {
        el.classList.remove("collapsed");
        delete el.dataset.locked;
        delete el.dataset.auto;
        updateCollapseBtn(el.id, false);
      }
    });
    fitPanelLayout();
    _panelsChanged();
  }
}

function loadExamplesInto(url, selectId, examplesObj, onReady) {
  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var sel = document.getElementById(selectId);
      if (!sel) return;
      // Remove any previously rendered optgroups (keep the placeholder option)
      Array.from(sel.querySelectorAll("optgroup")).forEach(function (g) { g.remove(); });
      var idx = 0, groups = [];
      data.groups.forEach(function (group) {
        var og = document.createElement("optgroup");
        og.label = group.label;
        var items = [];
        group.examples.forEach(function (ex) {
          var key = "ex" + idx++;
          var opt = document.createElement("option");
          opt.value = key;
          opt.textContent = ex.label;
          og.appendChild(opt);
          examplesObj[key] = Object.assign({}, ex, { text: Array.isArray(ex.text) ? ex.text.join("\n") : ex.text });
          items.push({ key: key, label: ex.label, purpose: ex.purpose });
        });
        groups.push({ label: group.label, items: items });
        sel.appendChild(og);
      });
      upgradeExamplesSelect(sel, groups);
      var fnName = ((sel.getAttribute("onchange") || "").match(/^\s*(\w+)\(/) || [])[1];
      if (fnName) _trackExample(fnName);
      if (typeof onReady === "function") onReady();
      if (fnName) quickLinkApply(fnName);
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

// Show what the grammar parser noted (such as a <name> without a rule, read as a terminal) in the error line, in
// the note style. Call after a successful parse; a later setError text replaces it.
function showGrammarNotes(g) {
  const el = document.getElementById("error-msg");
  if (!el) return;
  const notes = (g && g.notes) || [];
  el.classList.toggle("is-note", notes.length > 0);
  if (notes.length) el.textContent = notes.join(" ");
}

function tokenise(str) {
  const t = strTokenise(currentGrammar ? currentGrammar.terminals : [], str);
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
    tSetLog("Table Step ► fills the entries.");
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
  tSetLog("Table Step ► fills the entries.");
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
      var firstKey = null, idx = 0, groups = [];
      data.groups.forEach(function(group) {
        var og = document.createElement("optgroup");
        og.label = group.label;
        var items = [];
        group.examples.forEach(function(ex) {
          var key = "ex" + idx++;
          var opt = document.createElement("option");
          opt.value = key;
          opt.textContent = ex.label;
          og.appendChild(opt);
          examplesObj[key] = ex;
          items.push({ key: key, label: ex.label, purpose: ex.purpose });
          if (!firstKey) firstKey = key;
        });
        groups.push({ label: group.label, items: items });
        sel.appendChild(og);
      });
      upgradeExamplesSelect(sel, groups);
      var fnName = loadFn.name;
      _trackExample(fnName);
      if (firstKey && (!shouldLoadFirst || shouldLoadFirst())) window[fnName](firstKey);
      quickLinkApply(fnName);
    })
    .catch(function(err) {
      console.error("Failed to load examples from " + url, err);
    });
}
