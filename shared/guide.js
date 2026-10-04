// The "Guide" button in the top bar and its pop-up: what a tool does, how to use it, what
// its notation and colours mean. Like the Algorithm boxes it is on demand, never in the way.
// Each tool supplies its own text in tools/<tool>/guide.js (window.TOOL_GUIDE); this file is only the mechanism.
// Needs shared.css (the .algo-* modal styles) and ui.css (.guide-*).
(function () {
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // `code` between backticks
  const fmt = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>");

  const COMMON_KEYS = [
    ["← →", "step back and forward (also , and .)"],
    ["Home / End", "restart / run to the end"],
    ["T", "move the arrow keys to the next stepping panel (its header is tinted)"],
    ["F", "focus the current panel; press again to restore the layout"],
  ];
  const COMMON_USE = "The View menu (top right) copies a link to exactly what you see, switches theme, and rearranges the panels. Hovering something in one panel highlights the same thing in the others, in orange.";


  const DOT = { blue: "var(--accent)", green: "var(--st-accept)", red: "var(--st-reject)", grey: "var(--st-dead)", orange: "var(--hot)" };

  function html(g, withKeys) {
    const list = (items) => "<ul class=\"guide-list\">" + items.map((t) => "<li>" + fmt(t) + "</li>").join("") + "</ul>";
    const dl = (rows) => "<dl class=\"guide-terms\">" + rows.map((r) => "<dt>" + esc(r[0]) + "</dt><dd>" + fmt(r[1]) + "</dd>").join("") + "</dl>";
    const legend = g.legend.concat([["orange", "whatever you hover, in every panel where it appears"]]);
    return (
      "<p class=\"guide-intro\">" + fmt(g.intro) + "</p>" +
      "<h3 class=\"guide-h\">How to use it</h3>" + list(g.use.concat([COMMON_USE])) +
      (g.notation.length ? "<h3 class=\"guide-h\">Notation</h3>" + dl(g.notation) : "") +
      "<h3 class=\"guide-h\">Colours</h3><ul class=\"guide-list guide-legend\">" +
        legend.map((l) => "<li><span class=\"guide-dot\" style=\"background:" + DOT[l[0]] + "\"></span>" + fmt(l[1]) + "</li>").join("") + "</ul>" +
      "<h3 class=\"guide-h\">Keys</h3>" + dl(COMMON_KEYS)
    );
  }

  let overlay = null;
  function close() {
    if (overlay) overlay.classList.add("hidden");
    const b = document.getElementById("btn-guide");
    if (b) b.focus();
  }
  function open() {
    const g = window.TOOL_GUIDE;
    if (!g) return;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "guide-overlay";
      overlay.className = "algo-overlay hidden";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        else if (e.key === "Tab") { e.preventDefault(); overlay.querySelector(".algo-close").focus(); }
      });
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      "<div class=\"algo-modal\"><div class=\"algo-modal-head\"><h2>" + esc(g.title) + "</h2>" +
      "<span class=\"algo-subtitle\">guide</span>" +
      "<button type=\"button\" class=\"algo-close\" title=\"Close (Esc)\" aria-label=\"Close\">×</button></div>" +
      "<div class=\"algo-modal-body guide-body\">" + html(g) + "</div></div>";
    overlay.querySelector(".algo-close").addEventListener("click", close);
    overlay.classList.remove("hidden");
    overlay.querySelector(".algo-close").focus();
  }

  function install() {
    const bar = document.getElementById("topbar");
    if (!bar || !window.TOOL_GUIDE || document.getElementById("btn-guide")) return;
    const btn = document.createElement("button");
    btn.id = "btn-guide";
    btn.type = "button";
    btn.className = "guide-btn";
    btn.textContent = "Guide";
    btn.title = "What this tool does, how to use it, and what its notation and colours mean";
    btn.addEventListener("click", open);
    const view = document.getElementById("btn-view");
    bar.insertBefore(btn, view || null);
  }
  document.addEventListener("DOMContentLoaded", install);
})();
