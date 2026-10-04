// Pure layout logic for the resizable panel row. No DOM access.
//
// Panels share the row in proportion to their weights (CSS flex-grow with a
// zero basis), subject to a minimum width. Dragging a handle moves the boundary
// between its two neighbours; when the row is too narrow for every panel's
// minimum, the lowest-priority panels collapse to a thin strip.

const PANEL_COLLAPSED_W = 36;

// New widths for the two panels either side of a handle dragged by dx pixels.
// The pair keeps its combined width; neither goes below its minimum. Dragging
// further than `collapseAfter` pixels past a minimum collapses that panel to
// its strip (result.collapse is "left" or "right"); the other takes the space.
// canCollapseL / canCollapseR switch this off for a side.
function panelDrag({ widthL, widthR, minL, minR, dx, collapseAfter = 48, canCollapseL = true, canCollapseR = true, collapsedW = PANEL_COLLAPSED_W }) {
  const total = widthL + widthR;
  const raw = widthL + dx;
  if (canCollapseL && raw < minL - collapseAfter) return { left: collapsedW, right: total - collapsedW, collapse: "left" };
  if (canCollapseR && raw > total - minR + collapseAfter) return { left: total - collapsedW, right: collapsedW, collapse: "right" };
  const left = Math.min(Math.max(raw, minL), Math.max(minL, total - minR));
  return { left, right: total - left, collapse: null };
}

// Weights that reproduce the current widths (collapsed panels keep weight 0).
// Using the real widths as weights makes later changes to one pair leave every
// other panel exactly where it is.
function panelWeights(widths, collapsed) {
  return widths.map((w, i) => (collapsed[i] ? 0 : Math.round(w * 100) / 100));
}

// Which panels to auto-collapse or auto-expand so the row fits.
// panels[i] = { min, collapsed, auto, locked, priority }:
//   collapsed  currently a strip
//   auto       it was collapsed by this algorithm (may be re-expanded by it)
//   locked     the user chose its state; never changed here
//   priority   higher stays visible longer
// available is the row width minus the handles.
function fitPanels(panels, available, collapsedW = PANEL_COLLAPSED_W) {
  const width = (p) => (p.collapsed ? collapsedW : p.min);
  let needed = panels.reduce((s, p) => s + width(p), 0);
  const collapse = [];
  const expand = [];
  const state = panels.map((p) => ({ ...p }));

  // Too narrow: collapse the lowest-priority open panel that isn't locked.
  while (needed > available) {
    let pick = -1;
    state.forEach((p, i) => {
      if (p.collapsed || p.locked) return;
      if (pick < 0 || p.priority < state[pick].priority) pick = i;
    });
    if (pick < 0) break; // nothing left to collapse: the row will scroll
    needed -= state[pick].min - collapsedW;
    state[pick].collapsed = true;
    state[pick].auto = true;
    collapse.push(pick);
  }

  // Room to spare: bring back auto-collapsed panels, highest priority first.
  if (!collapse.length) {
    const order = state.map((p, i) => i).filter((i) => state[i].collapsed && state[i].auto && !state[i].locked).sort((a, b) => state[b].priority - state[a].priority);
    for (const i of order) {
      const extra = state[i].min - collapsedW;
      if (needed + extra > available) continue;
      needed += extra;
      state[i].collapsed = false;
      state[i].auto = false;
      expand.push(i);
    }
  }
  return { collapse, expand };
}

// ── Keyboard stepping ─────────────────────────────────────────────────
// Which stepper action a key press means, or null. Callers skip key presses
// that are typing into a field or arrive while a menu/modal is open.
//   ←/→ or ,/.  step back / forward      Home  reset      End  run to the end
//   t / T       move key focus to the next / previous stepping panel
//   f / F       focus on the current panel, or undo the focus
function stepperKeyAction({ key, ctrlKey = false, metaKey = false, altKey = false }) {
  if (ctrlKey || metaKey || altKey) return null;
  switch (key) {
    case "ArrowRight": case ".": return "step";
    case "ArrowLeft": case ",": return "back";
    case "Home": return "reset";
    case "End": return "end";
    case "t": return "next-panel";
    case "T": return "prev-panel";
    case "f": case "F": return "focus-panel";
    default: return null;
  }
}

// The panel id after `current` in `ids` (wrapping); dir is 1 or -1.
// An unknown current starts from the first id.
function nextKeyPanel(ids, current, dir = 1) {
  if (!ids.length) return null;
  const i = ids.indexOf(current);
  if (i < 0) return ids[0];
  return ids[(i + dir + ids.length) % ids.length];
}

// The id of the only open panel, or null when zero or several are open. A layout in
// which exactly one panel is open is "focused" (see panelFocus in shared.js).
function soleOpenPanel(panels) {
  const open = panels.filter((p) => !p.collapsed);
  return open.length === 1 ? open[0].id : null;
}
