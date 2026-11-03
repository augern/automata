// The transition table of a finite automaton as an editable table: one row for each state, one column for each symbol, a radio for the
// start state and a checkbox for each accepting state (the NFA and the pumping tool). Needs ui.js, algo/states.js and shared.js.
//
//   const table = createAutomatonTable("container-id", {
//     model: { states: [name], alphabet: [symbol], start: index, accepts: Set<index>, trans: { state: { symbol: [state] } } },
//     deterministic: false,   one target for each cell, no ε column
//     epsilon: true,          a column for ε-moves (never with deterministic)
//     error: { on: () => bool, name: () => string, symbols: (state) => [symbol], wild: string },   optional: the error state as a view option
//     onChange: () => {},     after every edit
//     onHoverCells: (ids | null) => {},   the pointer or focus is on a transition cell: ids is ["state|symbol"], null when it leaves
//     onHoverState: (index | null) => {}, the same for a state name
//   })
// The model is the caller's: the table edits it in place and reads it again on every render().
// On a phone (body.is-mobile, see mobile.js) a cell is not typed into: tapping it opens a sheet of the states as chips (several for an NFA, one
// or none for a deterministic table).
// Highlighting goes both ways: the table reports what is pointed at, and mark() lights what another view is pointing at.
//   -> { render, addState, removeState, addSymbol, removeSymbol, mark }
const AUTOMATON_TABLES = {};

function createAutomatonTable(id, opts) {
  const T = UI.table, m = () => opts.model;
  const det = !!opts.deterministic, eps = !!opts.epsilon && !det;
  const syms = () => (eps ? [...m().alphabet, "ε"] : m().alphabet);
  const call = (f, ...a) => `AUTOMATON_TABLES['${id}'].${f}(${a.join(", ")})`;
  const changed = () => { if (opts.onChange) opts.onChange(); };
  const kindOf = (i) => T.kind(i === m().start, m().accepts.has(i));
  const tagHtml = (list) => list.map((t) => `<span>${esc(t)}</span>`).join(""); // the size of a tag follows the number of tags (data-n, see mobile.css)
  const phone = () => document.body.classList.contains("is-mobile");
  const parts = (value) => value.split(",").map((s) => s.trim()).filter(Boolean);

  const self = {
    render() {
      const M = m(), err = opts.error && opts.error.on();
      let h = T.open() + "<thead><tr>";
      h += T.th("") + T.th("→", { title: "Start state" }) + T.th("★", { title: "Accepting state" });
      h += T.th("δ", { left: true, title: det ? "δ(q, a): the cell in row q and column a is the state reached from q on a; blank is no move." : "δ(q, a): the cell in row q and column a lists the states reached from q on a. Column ε lists the ε-moves." });
      M.alphabet.forEach((sym, si) => { h += T.th(esc(sym) + T.rmInline(call("removeSymbol", si), `Remove symbol '${sym}'`), { sym: true }); });
      if (eps) h += T.th("ε", { sym: true, muted: true });
      if (err) h += T.th('<span class="ui-wild">?</span>', { sym: true, title: "Any symbol outside the alphabet" });
      h += "</tr></thead><tbody>";
      const errName = err ? opts.error.name() : "";
      M.states.forEach((sn, i) => {
        h += `<tr data-si="${i}">` + T.rm(call("removeState", i), "Remove state");
        h += T.marker(`<input type="radio" name="${id}-start" ${i === M.start ? "checked" : ""} onchange="${call("setStart", i)}">`);
        h += T.marker(`<input type="checkbox" ${M.accepts.has(i) ? "checked" : ""} onchange="${call("toggleAccept", i, "this.checked")}">`);
        h += T.state(sn, kindOf(i));
        const errSyms = err ? opts.error.symbols(sn) : [];
        for (const sym of syms()) {
          const val = M.trans[sn] && M.trans[sn][sym] ? M.trans[sn][sym].join(", ") : "";
          const bad = parts(val).some((p) => !M.states.includes(p)) || (det && parts(val).length > 1);
          if (phone()) { // a button that shows the targets as wrapping tags: a long list grows the row instead of clipping
            const list = M.trans[sn] && M.trans[sn][sym] ? M.trans[sn][sym] : [];
            h += `<td class="ui-td--input${sym === "ε" ? " is-muted" : ""}"><div class="ui-cell ui-cell--tap" role="button" tabindex="0" data-n="${list.length}" data-state="${esc(sn)}" data-sym="${esc(sym)}">${tagHtml(list)}</div></td>`;
            continue;
          }
          h += T.input(val, `placeholder="${errSyms.includes(sym) ? esc(errName) : ""}" data-state="${esc(sn)}" data-sym="${esc(sym)}" data-trans-type="states"` +
            ` onchange="${call("onInput", "this")}" oninput="${call("validate", "this")}" onkeydown="transInputKeydown(event)"`, { muted: sym === "ε", invalid: bad });
        }
        if (err) h += T.cell(esc(errName), "is-error").replace("<td", `<td data-state="${esc(sn)}" data-sym="${opts.error.wild}"`);
        h += "</tr>";
      });
      if (err) {
        h += `<tr class="is-error-row"><td class="ui-td--rm"></td><td class="ui-td--marker"></td><td class="ui-td--marker"></td>` + T.state(errName, "reject");
        for (const sym of M.alphabet) h += T.cell(esc(errName), "is-error").replace("<td", `<td data-state="${esc(errName)}" data-sym="${esc(sym)}"`);
        if (eps) h += T.cell("", "is-muted");
        h += T.cell(esc(errName), "is-error").replace("<td", `<td data-state="${esc(errName)}" data-sym="${opts.error.wild}"`) + "</tr>";
      }
      document.getElementById(id).innerHTML = h + "</tbody></table>";
    },
    addState() {
      const M = m(), name = freshStateName(M.states);
      M.states.push(name);
      M.trans[name] = {};
      for (const sym of syms()) M.trans[name][sym] = [];
      self.render();
      changed();
    },
    removeState(idx) {
      const M = m(), removed = removeStateAt({ states: M.states, start: M.start, accepts: M.accepts }, idx);
      if (!removed) return; // at least one state stays
      M.states.splice(idx, 1);
      delete M.trans[removed.name];
      for (const s of M.states) for (const sym of syms()) if (M.trans[s] && M.trans[s][sym]) M.trans[s][sym] = M.trans[s][sym].filter((t) => t !== removed.name);
      M.start = removed.start;
      M.accepts = removed.accepts;
      self.render();
      changed();
    },
    addSymbol() {
      let name = prompt("New symbol (one character):", "");
      if (name === null) return;
      name = name.trim();
      if (!name || name === "ε") return;
      if ([...name].length !== 1) { alert("A symbol is one character: the input is read one character at a time."); return; }
      const M = m();
      if (M.alphabet.includes(name)) return;
      M.alphabet.push(name);
      for (const s of M.states) { if (!M.trans[s]) M.trans[s] = {}; if (!M.trans[s][name]) M.trans[s][name] = []; }
      self.render();
      changed();
    },
    removeSymbol(idx) {
      const M = m(), sym = M.alphabet[idx];
      if (sym === undefined) return;
      M.alphabet.splice(idx, 1);
      for (const s of M.states) if (M.trans[s]) delete M.trans[s][sym];
      self.render();
      changed();
    },
    setStart(idx) {
      m().start = idx;
      UI.table.refreshStates(kindOf);
      changed();
    },
    toggleAccept(idx, on) {
      if (on) m().accepts.add(idx); else m().accepts.delete(idx);
      UI.table.refreshStates(kindOf);
      changed();
    },
    onInput(input) {
      const M = m(), s = input.dataset.state;
      if (!M.trans[s]) M.trans[s] = {};
      M.trans[s][input.dataset.sym] = parts(input.value);
      self.validate(input);
      changed();
    },
    validate(input) {
      const p = parts(input.value);
      input.classList.toggle("invalid", p.some((x) => !m().states.includes(x)) || (det && p.length > 1));
    },
  };
  // light the cells, the state row or both; what is not given is left as it is
  // the sheet of states for one cell
  const sheet = {
    el: null,
    cell: null,
    open(input) {
      if (!this.el) this.build();
      this.cell = { state: input.dataset.state, sym: input.dataset.sym, input };
      this.el.querySelector(".at-sheet__title").textContent = `δ(${this.cell.state}, ${this.cell.sym})`;
      this.chips();
      this.el.hidden = false;
      input.closest("td").classList.add("is-editing");
    },
    close() {
      if (!this.el || this.el.hidden) return;
      this.el.hidden = true;
      document.querySelectorAll(".ui-td--input.is-editing").forEach((td) => td.classList.remove("is-editing"));
      this.cell = null;
    },
    chips() {
      const M = m(), row = M.trans[this.cell.state], on = new Set((row && row[this.cell.sym]) || []);
      const box = this.el.querySelector(".at-sheet__chips");
      box.innerHTML = "";
      const chip = (label, isOn, pick) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "at-chip" + (isOn ? " is-on" : "");
        b.textContent = label;
        b.setAttribute("aria-pressed", String(isOn));
        b.addEventListener("click", pick);
        box.appendChild(b);
      };
      M.states.forEach((name) => chip(name, on.has(name), () => this.pick(name, !on.has(name))));
      if (det) chip("none", on.size === 0, () => this.pick(null, false));
    },
    // set the cell: a chip toggled (several for an NFA, one for a deterministic table), or none
    pick(name, make) {
      const M = m(), { state, sym, input } = this.cell;
      let list = new Set((M.trans[state] && M.trans[state][sym]) || []);
      if (name === null) list = new Set();
      else if (det) list = make ? new Set([name]) : new Set();
      else if (make) list.add(name); else list.delete(name);
      if (!M.trans[state]) M.trans[state] = {};
      M.trans[state][sym] = M.states.filter((x) => list.has(x));
      if (input.tagName === "INPUT") { input.value = M.trans[state][sym].join(", "); self.validate(input); }
      else { input.innerHTML = tagHtml(M.trans[state][sym]); input.dataset.n = M.trans[state][sym].length; }
      this.chips();
      changed();
    },
    build() {
      this.el = document.createElement("div");
      this.el.className = "at-sheet";
      this.el.hidden = true;
      this.el.innerHTML = '<div class="at-sheet__back"></div><div class="at-sheet__panel"><div class="at-sheet__head"><span class="at-sheet__title"></span><button type="button" class="btn at-sheet__done">Done</button></div><div class="at-sheet__chips"></div></div>';
      this.el.querySelector(".at-sheet__back").addEventListener("click", () => this.close());
      this.el.querySelector(".at-sheet__done").addEventListener("click", () => this.close());
      document.body.appendChild(this.el);
    },
  };
  document.getElementById(id).addEventListener("click", (e) => {
    const cell = phone() && e.target.closest && e.target.closest(".ui-cell--tap");
    if (cell) sheet.open(cell);
  });
  document.getElementById(id).addEventListener("keydown", (e) => {
    const cell = phone() && (e.key === "Enter" || e.key === " ") && e.target.closest && e.target.closest(".ui-cell--tap");
    if (cell) { e.preventDefault(); sheet.open(cell); }
  });
  document.addEventListener("mobilechange", () => { sheet.close(); self.render(); });

  self.mark = (what) => {
    const box = document.getElementById(id);
    if ("cells" in what) {
      const want = new Set(what.cells || []);
      for (const inp of box.querySelectorAll("[data-sym]")) (inp.closest("td") || inp).classList.toggle("is-hot", want.has(inp.dataset.state + "|" + inp.dataset.sym));
    }
    if ("state" in what) for (const tr of box.querySelectorAll("tr[data-si]")) tr.querySelector(".ui-td--state").classList.toggle("is-hot", +tr.dataset.si === what.state);
  };
  if (opts.onHoverCells) UI.hoverItems(id, "[data-sym]", (inp) => [inp.dataset.state + "|" + inp.dataset.sym], opts.onHoverCells);
  if (opts.onHoverState) UI.hoverItems(id, "td.ui-td--state", (td) => +td.parentElement.dataset.si, opts.onHoverState);
  AUTOMATON_TABLES[id] = self;
  return self;
}
