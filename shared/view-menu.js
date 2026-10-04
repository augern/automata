// The "View" dropdown at the right of every tool's top bar: share link, theme,
// and layout presets. Needs ui.js (UI.menu), share-link.js (copyShareLink) and
// theme.js (themeToggle / themeIsDark); the layout items need the panel code in
// shared.js and only appear on pages that have panels.
(function () {
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
    const steppers = typeof keyPanelSummaries === "function" ? keyPanelSummaries() : [];
    if (steppers.length > 1) {
      list.push(
        { separator: true },
        { heading: "Arrow keys step" },
        ...steppers.map((p) => ({ label: p.title, checked: p.keyFocus, onSelect: () => setKeyPanel(p.id) })),
        { label: "Next stepping panel", hint: "T", onSelect: () => setKeyPanel(nextKeyPanel(steppers.map((p) => p.id), (steppers.find((p) => p.keyFocus) || {}).id, 1)) }
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

  function install() {
    const bar = document.getElementById("topbar");
    if (!bar || document.getElementById("btn-view") || typeof UI === "undefined") return;
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
