// The "Definitions" button in the top bar and its pop-up: the formal definitions the tool rests on, each with its source.
// Like the Guide it is on demand and belongs to the tool, not to a panel. A tool supplies its text in
// tools/<tool>/definitions.js (window.TOOL_DEFINITIONS): sections of items, each the key of an item of def-library.js or an item of
// its own; this file is only the mechanism.
// Needs algo/tex.js, def-library.js, shared.css (the .algo-* modal styles) and ui.css (.guide-body, .def-*).
(function () {
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>");

  // a source is "key" or "key §section"; the numbers follow the order in which the sources are first cited
  function html(d) {
    const lib = window.DEF_LIBRARY, order = [];
    const cite = (r) => {
      const key = r.split(" ")[0];
      if (!order.includes(key)) order.push(key);
      return "<span class=\"def-src\" title=\"" + esc(lib.sources[key]) + "\">[" + (order.indexOf(key) + 1) + "]" + esc(r.slice(key.length)) + "</span>";
    };
    const item = (it) => (typeof it === "string" ? lib.items[it] : it);
    const card = (it) =>
      "<div class=\"def-item\"><div class=\"def-term\">" + esc(it.term) + "</div>" +
      (it.formal.length ? "<div class=\"def-formal\">" + it.formal.map((l) => "<div class=\"def-line\">" + texToMathML(l) + "</div>").join("") + "</div>" : "") +
      (it.text ? "<p class=\"def-text\">" + fmt(it.text) + "</p>" : "") +
      "<div class=\"def-from\">" + (it.refs.length ? it.refs.map(cite).join(" ") : "this tool") + "</div></div>";
    const body = d.sections.map((s) => "<h3 class=\"guide-h\">" + esc(s.title) + "</h3>" + s.items.map((k) => card(item(k))).join("")).join("");
    return body + "<h3 class=\"guide-h\">Sources</h3><ol class=\"def-refs\">" + order.map((k) => "<li>" + esc(lib.sources[k]) + "</li>").join("") + "</ol>";
  }

  let overlay = null;
  function close() {
    if (overlay) overlay.classList.add("hidden");
    const b = document.getElementById("btn-defs");
    if (b) b.focus();
  }
  function open() {
    const d = window.TOOL_DEFINITIONS;
    if (!d) return;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "defs-overlay";
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
      "<div class=\"algo-modal\"><div class=\"algo-modal-head\"><h2>" + esc(d.title) + "</h2>" +
      "<span class=\"algo-subtitle\">definitions</span>" +
      "<button type=\"button\" class=\"algo-close\" title=\"Close (Esc)\" aria-label=\"Close\">×</button></div>" +
      "<div class=\"algo-modal-body guide-body\">" + html(d) + "</div></div>";
    overlay.querySelector(".algo-close").addEventListener("click", close);
    overlay.classList.remove("hidden");
    overlay.querySelector(".algo-close").focus();
  }

  function install() {
    const bar = document.getElementById("topbar");
    if (!bar || !window.TOOL_DEFINITIONS || document.getElementById("btn-defs")) return;
    const btn = document.createElement("button");
    btn.id = "btn-defs";
    btn.type = "button";
    btn.className = "guide-btn";
    btn.textContent = "Definitions";
    btn.title = "The formal definitions this tool is built on, with their sources";
    btn.addEventListener("click", open);
    bar.insertBefore(btn, document.getElementById("btn-guide") || document.getElementById("btn-view") || null);
  }
  document.addEventListener("DOMContentLoaded", install);
})();
