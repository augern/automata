// The "View" dropdown at the right of every tool's top bar: share link, theme,
// and layout presets. Needs ui.js (UI.menu), share-link.js (copyShareLink) and
// theme.js (themeToggle / themeIsDark); the layout items need the panel code in
// shared.js and only appear on pages that have panels.
(function () {
  const here = document.currentScript && document.currentScript.src;

  function items() {
    const list = [
      {
        label: "Copy link to this view",
        hint: "share",
        onSelect: async () => {
          const ok = await copyShareLink();
          UI.toast(ok ? "Link copied" : "Nothing to share yet");
        },
      },
      { label: themeIsDark() ? "Switch to light theme" : "Switch to dark theme", onSelect: themeToggle },
    ];
    if (typeof fitViewUsed !== "undefined" && fitViewUsed) {
      list.push(
        { separator: true },
        { heading: "Scroll wheel on graphs" },
        { label: "Detect mouse or trackpad", checked: fitWheelMode === "auto", title: "A mouse wheel zooms, a two-finger trackpad scroll pans; pinch always zooms", onSelect: () => setFitWheelMode("auto") },
        { label: "Always zoom", checked: fitWheelMode === "zoom", title: "For a mouse that is mistaken for a trackpad", onSelect: () => setFitWheelMode("zoom") },
        { label: "Always pan", checked: fitWheelMode === "pan", onSelect: () => setFitWheelMode("pan") }
      );
    }
    if (typeof treeDirMode !== "undefined" && document.getElementById("tree-svg")) {
      list.push(
        { separator: true },
        { heading: "Parse tree direction" },
        { label: "Automatic", checked: treeDirMode === "auto", title: "Top-down, or sideways when that fits the pane better", onSelect: () => setTreeDirMode("auto") },
        { label: "Top-down", checked: treeDirMode === "down", onSelect: () => setTreeDirMode("down") },
        { label: "Sideways", checked: treeDirMode === "side", title: "Root on the left, children to its right", onSelect: () => setTreeDirMode("side") }
      );
    }
    const steppers = typeof keyPanelSummaries === "function" ? keyPanelSummaries() : [];
    if (steppers.length > 1) {
      list.push(
        { separator: true },
        { heading: "Arrow keys step" },
        ...steppers.map((p) => ({ label: p.title, checked: p.keyFocus, disabled: p.collapsed, title: p.collapsed ? "Collapsed" : undefined, onSelect: () => setKeyPanel(p.id) })),
        { label: "Next stepping panel", hint: "T", onSelect: () => setKeyPanel(nextKeyPanel(steppers.filter((p) => !p.collapsed).map((p) => p.id), (steppers.find((p) => p.keyFocus) || {}).id, 1)) }
      );
    }
    if (document.getElementById("panels") && typeof panelsResetLayout === "function") {
      list.push(
        { separator: true },
        { heading: "Layout" },
        ...(panelFocusedId() ? [{ label: "Restore layout before focus", hint: "F", title: "Undo Focus: bring back the panels as they were", onSelect: panelRestoreFocus }] : []),
        { label: "Restore default layout", onSelect: panelsResetLayout },
        { label: "Equal panel widths", onSelect: panelsEqualWidths },
        { label: "Expand all panels", onSelect: panelsExpandAll },
        { separator: true },
        { heading: "Focus on" },
        ...panelSummaries().map((p) => ({ label: p.title, checked: p.focused ? true : undefined, onSelect: () => (p.focused ? panelRestoreFocus() : panelFocus(p.id)) }))
      );
    }
    return list;
  }

  // The way back to the index page, first in the bar.
  function installHome(bar) {
    if (!here || document.getElementById("btn-home")) return;
    const a = document.createElement("a");
    a.id = "btn-home";
    a.className = "home-btn";
    a.href = new URL("../index.html", here).href;
    a.title = "Back to the index of tools";
    a.innerHTML = '<span aria-hidden="true">‹</span> Index';
    bar.insertBefore(a, bar.firstChild);
  }

  function install() {
    const bar = document.getElementById("topbar");
    if (!bar || document.getElementById("btn-view") || typeof UI === "undefined") return;
    installHome(bar);
    const btn = document.createElement("button");
    btn.id = "btn-view";
    btn.type = "button";
    btn.className = "view-btn";
    btn.innerHTML = 'View <span aria-hidden="true">▾</span>';
    btn.title = "Share link, theme and panel layout";
    bar.appendChild(btn);
    UI.menu(btn, items, { align: "right" });
  }

  document.addEventListener("DOMContentLoaded", install);
})();
