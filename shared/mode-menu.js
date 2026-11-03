// The mode selector of a tool: one button in the top bar, labelled with the current mode, that opens a menu of the modes (the current one
// checked) and, below a separator, the options that go with them. Needs ui.js (UI.menu).
//   const modes = createModeMenu({
//     label: "Method",                               heading of the menu
//     modes: [{ id, label, title? }],
//     current: () => id,
//     select: (id) => {},
//     options: () => [menu items],                   optional: after a separator
//   });
//   modes.refresh();                                  the button follows current(): call it whenever the mode changes
function createModeMenu(spec) {
  const bar = document.getElementById("topbar");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mode-menu-btn";
  btn.title = spec.label;
  btn.setAttribute("aria-label", spec.label);
  const h1 = bar.querySelector("h1");
  bar.insertBefore(btn, h1 ? h1.nextSibling : bar.firstChild);
  const refresh = () => {
    const now = spec.modes.find((m) => m.id === spec.current());
    btn.innerHTML = '<span class="mode-menu-label"></span> <span aria-hidden="true">▾</span>';
    btn.firstChild.textContent = now ? now.label : "";
  };
  UI.menu(btn, () => {
    const opts = spec.options ? spec.options() : [];
    return [
      { heading: spec.label },
      ...spec.modes.map((m) => ({ label: m.label, title: m.title, checked: spec.current() === m.id, onSelect: () => spec.select(m.id) })),
      ...(opts.length ? [{ separator: true }, ...opts] : []),
    ];
  }, { align: "left" });
  refresh();
  return { refresh, button: btn };
}
