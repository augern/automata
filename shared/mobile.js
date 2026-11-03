// Phone layout for a tool that opts in with <body data-mobile>: at narrow widths one panel is shown at a time, chosen with a tab bar at
// the bottom (a panel with data-mobile-skip has no tab: the tool offers its content some other way on a phone), and the panel's ⋯ menu (with the View menu's basics) in the top bar. A panel's tab label is its data-tab, else its title. Needs shared.js; the styles are in mobile.css.
(function () {
  const mq = window.matchMedia("(max-width: 720px)");
  const key = "parser-tools-tab:" + location.pathname;
  let bar = null, active = null;
  const panels = () => Array.from(document.querySelectorAll("#panels > .panel"));

  function show(id) {
    active = id;
    panels().forEach((p) => p.classList.toggle("is-tab", p.id === id));
    bar.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.panel === id)));
    try { sessionStorage.setItem(key, id); } catch (e) { /* private mode */ }
    window.dispatchEvent(new Event("resize")); // a graph fits its canvas once the canvas is shown
  }

  function apply() {
    document.body.classList.toggle("is-mobile", mq.matches);
    if (mq.matches) show(active);
    document.dispatchEvent(new Event("mobilechange")); // what is drawn differently on a phone (the table's cells) redraws
  }

  function install() {
    if (!document.body.hasAttribute("data-mobile") || !document.getElementById("panels")) return;
    bar = document.createElement("nav");
    bar.id = "mobile-tabs";
    bar.setAttribute("role", "tablist");
    for (const p of panels().filter((x) => !x.hasAttribute("data-mobile-skip"))) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset.panel = p.id;
      b.textContent = p.dataset.tab || (p.querySelector(".panel-title") || {}).textContent || p.id;
      b.addEventListener("click", () => show(p.id));
      bar.appendChild(b);
    }
    document.body.appendChild(bar);
    let saved = null;
    try { saved = sessionStorage.getItem(key); } catch (e) { /* private mode */ }
    const tabbed = panels().filter((p) => !p.hasAttribute("data-mobile-skip"));
    active = tabbed.some((p) => p.id === saved) ? saved : tabbed[0].id;
    mq.addEventListener("change", apply);
    apply();
  }
  document.addEventListener("DOMContentLoaded", install);
})();
