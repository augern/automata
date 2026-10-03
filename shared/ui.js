// Behaviour helpers for the components in ui.css. One global, `UI`, so the
// helpers cannot collide with a tool's own names.
//
//   const verdict = UI.banner("sim-result");
//   verdict.show("accept", "✓  ACCEPTED");   // kind: "accept" | "reject" | "warn"
//   verdict.hide();
//
//   const log = UI.logBar("sim-log-bar");
//   log.set("Read <b>a</b>");  log.clear();
//
// Both accept an element or an element id.
const UI = (() => {
  const el = (target) => (typeof target === "string" ? document.getElementById(target) : target);

  return {
    el,

    banner(target) {
      const e = el(target);
      return {
        show(kind, text) {
          e.textContent = text;
          e.className = "ui-result ui-result--" + kind + " is-visible";
        },
        hide() {
          e.textContent = "";
          e.className = "ui-result";
        },
      };
    },

    logBar(target) {
      const e = el(target);
      return {
        set(html) {
          e.innerHTML = html || "";
        },
        clear() {
          e.innerHTML = "";
        },
      };
    },
  };
})();
