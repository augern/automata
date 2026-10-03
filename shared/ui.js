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

    // HTML builders for the editable definition table (class names in ui.css).
    // Text arguments are escaped; `attrs` is a raw attribute string you write.
    // Handlers are inline calls such as "removeState(3)".
    table: {
      open(extraClass = "") {
        return `<table class="ui-table${extraClass ? " " + extraClass : ""}">`;
      },
      // content is HTML (pass entities like &rarr; or esc()'d text)
      // tone: "accept" | "reject" colours the heading (e.g. the TM's A and R columns)
      th(content, { title = "", sym = false, wide = false, muted = false, left = false, tone = "" } = {}) {
        const cls = [sym && "ui-th--sym", wide && "ui-th--wide", muted && "ui-th--muted", left && "ui-th--left", tone && "ui-th--" + tone].filter(Boolean).join(" ");
        return `<th${cls ? ` class="${cls}"` : ""}${title ? ` title="${esc(title)}"` : ""}>${content}</th>`;
      },
      // × button that removes a row
      rm(call, title) {
        return `<td class="ui-td--rm"><button class="ui-rm" onclick="${call}" title="${esc(title)}">×</button></td>`;
      },
      // × button inside a column header
      rmInline(call, title) {
        return `<button class="ui-rm ui-rm--inline" onclick="${call}" title="${esc(title)}">×</button>`;
      },
      marker(inputHtml) {
        return `<td class="ui-td--marker">${inputHtml}</td>`;
      },
      // kind: "" | "start" | "accept" | "reject" | "both"
      state(name, kind = "") {
        return `<td class="ui-td--state${kind ? " is-" + kind : ""}">${esc(name)}</td>`;
      },
      // editable cell; size: "" | "narrow" | "wide"; invalid marks the input as an error
      input(value, attrs = "", { muted = false, size = "", invalid = false } = {}) {
        const cls = ["ui-td--input", muted && "is-muted"].filter(Boolean).join(" ");
        const icls = ["ui-cell", size && "ui-cell--" + size, invalid && "invalid"].filter(Boolean).join(" ");
        return `<td class="${cls}"><input class="${icls}" type="text" value="${esc(value)}" ${attrs}></td>`;
      },
      cell(html, extraClass = "") {
        return `<td class="ui-td--static${extraClass ? " " + extraClass : ""}">${html}</td>`;
      },
      kind(isStart, isAccept, isReject = false) {
        if (isReject) return "reject";
        if (isStart && isAccept) return "both";
        if (isStart) return "start";
        if (isAccept) return "accept";
        return "";
      },
      // Re-apply state-name colours without re-rendering; kindOf(i) -> kind
      refreshStates(kindOf) {
        document.querySelectorAll(".ui-td--state").forEach((td, i) => {
          for (const k of ["start", "accept", "reject", "both"]) td.classList.toggle("is-" + k, kindOf(i) === k);
        });
      },
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
