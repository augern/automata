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
// A die face with five pips, drawn in the current text colour.
const DIE_SVG =
  '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  [[4.2, 4.2], [9.8, 4.2], [7, 7], [4.2, 9.8], [9.8, 9.8]].map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.05" fill="currentColor"/>').join("") + "</svg>";

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

    // Pop-up menu attached to a trigger button.
    //   UI.menu(button, () => [
    //     { label: "Algorithm", onSelect: fn },
    //     { label: "Show grid", checked: true, onSelect: fn },
    //     { separator: true },
    //     { heading: "Layout" },
    //     { label: "Reset", hint: "Ctrl+0", disabled: false, title: "tooltip", onSelect: fn },
    //   ], { align: "right" })
    // The item list is read each time the menu opens, so labels and checkmarks
    // are always current. Arrow keys, Home/End, Enter/Space and Escape work;
    // clicking elsewhere closes it. Returns { open, close }.
    menu(trigger, getItems, { align = "right" } = {}) {
      const btn = el(trigger);
      let pop = null;
      btn.setAttribute("aria-haspopup", "menu");
      btn.setAttribute("aria-expanded", "false");

      const enabled = () => (pop ? [...pop.querySelectorAll(".ui-menu__item:not([disabled])")] : []);
      function focusAt(i) {
        const items = enabled();
        if (items.length) items[(i + items.length) % items.length].focus();
      }
      function close(returnFocus) {
        if (!pop) return;
        pop.remove();
        pop = null;
        btn.setAttribute("aria-expanded", "false");
        document.removeEventListener("mousedown", onOutside, true);
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("resize", onResize);
        if (returnFocus) btn.focus();
      }
      const onOutside = (e) => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(false); };
      const onResize = () => close(false);
      function onKey(e) {
        if (!pop) return;
        const items = enabled();
        const i = items.indexOf(document.activeElement);
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
        else if (e.key === "ArrowDown") { e.preventDefault(); focusAt(i + 1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); focusAt(i < 0 ? -1 : i - 1); }
        else if (e.key === "Home") { e.preventDefault(); focusAt(0); }
        else if (e.key === "End") { e.preventDefault(); focusAt(-1); }
        else if (e.key === "Tab") close(false);
      }
      function open() {
        close(false);
        pop = document.createElement("div");
        pop.className = "ui-menu";
        pop.setAttribute("role", "menu");
        for (const it of getItems()) {
          if (it.separator) {
            const sep = document.createElement("div");
            sep.className = "ui-menu__sep";
            sep.setAttribute("role", "separator");
            pop.appendChild(sep);
          } else if (it.heading) {
            const h = document.createElement("div");
            h.className = "ui-menu__heading";
            h.textContent = it.heading;
            pop.appendChild(h);
          } else {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "ui-menu__item";
            b.setAttribute("role", it.checked === undefined ? "menuitem" : "menuitemcheckbox");
            if (it.checked !== undefined) b.setAttribute("aria-checked", String(!!it.checked));
            if (it.title) b.title = it.title;
            if (it.disabled) b.disabled = true;
            b.innerHTML = '<span class="ui-menu__check">' + (it.checked ? "✓" : "") + "</span>" +
              '<span class="ui-menu__label"></span>' + (it.hint ? '<span class="ui-menu__hint"></span>' : "");
            b.querySelector(".ui-menu__label").textContent = it.label;
            if (it.hint) b.querySelector(".ui-menu__hint").textContent = it.hint;
            b.addEventListener("click", () => { close(true); if (it.onSelect) it.onSelect(); });
            pop.appendChild(b);
          }
        }
        document.body.appendChild(pop);
        // Place under the trigger, kept inside the viewport.
        const r = btn.getBoundingClientRect();
        pop.style.top = r.bottom + 4 + "px";
        pop.style.maxHeight = Math.max(120, window.innerHeight - r.bottom - 12) + "px";
        const w = pop.offsetWidth;
        const left = align === "right" ? r.right - w : r.left;
        pop.style.left = Math.max(8, Math.min(left, window.innerWidth - w - 8)) + "px";
        btn.setAttribute("aria-expanded", "true");
        document.addEventListener("mousedown", onOutside, true);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("resize", onResize);
        focusAt(0);
      }
      btn.addEventListener("click", (e) => { e.stopPropagation(); if (pop) close(true); else open(); });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!pop) open(); }
      });
      return { open, close };
    },

    // String entry for simulation panels: the text input with a random-string
    // button and an examples dropdown attached flush to its right edge.
    //   UI.stringInput("sim-string-input", {
    //     random: () => "abba",            // string, or null if none can be made
    //     examples: () => ["", "ab"],      // read each time the menu opens
    //     onPick: (s) => simRun(),         // called after the input was set
    //     heading: "Examples",             // optional menu heading
    //   })
    // The input keeps its own id and listeners; `random` and `examples` are optional.
    stringInput(target, { random, examples, onPick, heading = "Examples" } = {}) {
      const input = el(target);
      const wrap = document.createElement("div");
      wrap.className = "ui-strin";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const pick = (s) => {
        input.value = s;
        if (onPick) onPick(s);
      };
      function pickRandom() {
        let s = null;
        for (let i = 0; i < 6; i++) {
          s = random();
          if (s !== null && s !== input.value) break;
        }
        if (s === null) UI.toast("Could not generate a string");
        else pick(s);
      }
      function addButton(cls, text, title) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ui-strin__btn " + cls;
        b.innerHTML = text;
        b.title = title;
        b.setAttribute("aria-label", title);
        wrap.appendChild(b);
        return b;
      }
      if (random) addButton("ui-strin__btn--random", DIE_SVG, "Random string").addEventListener("click", pickRandom);
      if (examples || random) {
        const btn = addButton("ui-strin__btn--menu", "▾", "Example strings");
        UI.menu(btn, () => {
          const list = examples ? examples() : [];
          const items = [];
          if (random) items.push({ label: "Random string", onSelect: pickRandom });
          if (list.length) {
            if (random) items.push({ separator: true });
            items.push({ heading });
            for (const s of list) items.push({ label: s === "" ? "ε  (empty string)" : s, checked: s === input.value ? true : undefined, onSelect: () => pick(s) });
          } else if (examples) {
            items.push({ separator: random ? true : undefined }, { label: "No example strings", disabled: true });
          }
          return items.filter((i) => !(i.separator === undefined && !i.label && !i.heading));
        }, { align: "right" });
      }
      return { input };
    },

    // Report which item of a container the pointer (or keyboard focus) is on, so that table
    // rows, cells and graph elements can highlight each other.
    //   UI.hoverItems("rules-table-wrap", "tr[data-rule]", (el) => +el.dataset.rule, (id) => ...)
    // `onChange` gets the item's id, or null when the pointer leaves it. Delegated, so it
    // survives the container's contents being re-rendered.
    hoverItems(container, selector, idOf, onChange) {
      const c = el(container);
      const at = (e) => {
        const item = e.target.closest && e.target.closest(selector);
        return item && c.contains(item) ? idOf(item) : null;
      };
      c.addEventListener("mouseover", (e) => onChange(at(e)));
      c.addEventListener("mouseleave", () => onChange(null));
      c.addEventListener("focusin", (e) => onChange(at(e)));
      c.addEventListener("focusout", () => onChange(null));
    },

    // Fill an explanation box (a <div class="ui-explain" hidden>) or hide it with null.
    //   UI.explain("tree-info", {
    //     title: "Configuration (q0, ab, ⊥)",              // plain text
    //     facts: [["State", "q0"], ["Stack", "A ⊥"]],      // label (text), value (HTML)
    //     lines: ["From …", UI.explainRole("dead", "Dead end") + " no rule …"],  // HTML paragraphs
    //     onClose: () => …,                                // shows the × button
    //   })
    // Callers escape whatever they put into HTML strings.
    explain(target, spec) {
      const box = el(target);
      if (!spec) { box.hidden = true; box.innerHTML = ""; return; }
      const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      box.innerHTML =
        '<div class="ui-explain__head"><span class="ui-explain__title">' + esc(spec.title) + "</span>" +
        (spec.onClose ? '<button type="button" class="ui-explain__close" title="Close" aria-label="Close explanation">×</button>' : "") + "</div>" +
        (spec.facts && spec.facts.length ? '<dl class="ui-explain__facts">' + spec.facts.map((f) => "<dt>" + esc(f[0]) + "</dt><dd>" + f[1] + "</dd>").join("") + "</dl>" : "") +
        (spec.lines || []).map((l) => '<p class="ui-explain__line">' + l + "</p>").join("");
      const close = box.querySelector(".ui-explain__close");
      if (close) close.addEventListener("click", spec.onClose);
      box.hidden = false;
    },
    // The coloured lead word of an explanation line; kind is initial | live | accepted |
    // rejected | dead | expanded.
    explainRole(kind, label) {
      return '<span class="ui-explain__role ui-explain__role--' + kind + '">' + label + ":</span>";
    },

    // A short message at the bottom of the window that fades after ~2 seconds.
    toast(message) {
      const t = document.createElement("div");
      t.className = "ui-toast";
      t.setAttribute("role", "status");
      t.textContent = message;
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add("is-visible"));
      setTimeout(() => { t.classList.remove("is-visible"); setTimeout(() => t.remove(), 250); }, 2000);
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
