// The grammar editor: the grammar as a table of productions, one row per production, in place of a text area.
//
//   GrammarEditor.attach(textarea)
//
// The text area stays the interface to the tool: it is hidden, and it holds the grammar text. The editor writes the
// text into it (and dispatches an "input" event) when a production changes; setting textarea.value from the tool
// (an example, a shared link) redraws the editor. A Rules | Text switch shows the same grammar as plain text.
//
// A row: [on/off] [production number] [left side →] [symbols as chips] [menu]. Adjacent productions with the same
// left side show it faded: written with |, but separate productions to the parser. Typing in the end field of a row
// makes chips (Space or Enter), a | starts the next production, Enter on an empty field starts the next production
// with the same left side, Backspace on an empty field removes the last chip. Needs algo/grammar-model.js and ui.js.
const GrammarEditor = (() => {
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const ANGLE = /^<[^<>\s]+>$/;

  function attach(textarea) {
    let model = { arrow: "->", rows: [] };
    let view = "rules";
    try { if (localStorage.getItem("parser-tools-grammar-view") === "text") view = "text"; } catch (e) { /* storage blocked */ }
    let undo = [], redo = [];
    let parseError = "";

    const host = el("div", "ge");
    textarea.parentNode.insertBefore(host, textarea);
    textarea.style.display = "none";

    const bar = el("div", "ge-bar");
    const tabRules = el("button", "ge-tab", "Rules"), tabText = el("button", "ge-tab", "Text");
    for (const [b, v] of [[tabRules, "rules"], [tabText, "text"]]) {
      b.type = "button";
      b.addEventListener("click", () => setView(v));
    }
    const status = el("span", "ge-status");
    bar.append(tabRules, tabText, status);
    const rowsEl = el("div", "ge-rows");
    const foot = el("div", "ge-foot");
    const addRule = el("button", "btn", "+ Rule"), addNt = el("button", "btn", "+ Nonterminal");
    addRule.type = addNt.type = "button";
    addRule.title = "A production for the left side of the last one";
    addNt.title = "A production for a new left side";
    foot.append(addRule, addNt);
    const textEl = el("textarea", "ge-text");
    textEl.spellcheck = false;
    host.append(bar, rowsEl, foot, textEl);

    // ── State and text ──
    const text = () => gmToText(model);
    function readText(t) {
      try { model = gmParse(t); parseError = ""; } catch (e) { parseError = e.message; }
    }
    function changed(newModel, focus) {
      undo.push(JSON.stringify(model));
      if (undo.length > 100) undo.shift();
      redo = [];
      model = newModel;
      parseError = "";
      nativeValue.set.call(textarea, text());
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      render(focus);
    }
    function restore(json) {
      model = JSON.parse(json);
      nativeValue.set.call(textarea, text());
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      render();
    }
    function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(model)); restore(undo.pop()); }
    function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(model)); restore(redo.pop()); }

    // The tool sets textarea.value (examples, shared links): follow it.
    Object.defineProperty(textarea, "value", {
      configurable: true,
      get() { return nativeValue.get.call(this); },
      set(v) {
        nativeValue.set.call(this, v);
        undo = []; redo = [];
        readText(String(v));
        render();
      },
    });

    function setView(v) {
      view = v;
      try { localStorage.setItem("parser-tools-grammar-view", v); } catch (e) { /* storage blocked */ }
      render();
    }

    // Text view
    textEl.addEventListener("input", () => {
      nativeValue.set.call(textarea, textEl.value);
      readText(textEl.value);
      status.textContent = parseError;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // ── Rendering ──
    function render(focus) {
      tabRules.classList.toggle("is-on", view === "rules");
      tabText.classList.toggle("is-on", view === "text");
      rowsEl.style.display = foot.style.display = view === "rules" ? "" : "none";
      textEl.style.display = view === "text" ? "" : "none";
      status.textContent = parseError;
      if (view === "text") { if (document.activeElement !== textEl) textEl.value = nativeValue.get.call(textarea); return; }
      rowsEl.innerHTML = "";
      const nts = gmNonterminals(model), nums = gmNumbers(model), ghosts = gmGhosts(model);
      model.rows.forEach((row, i) => {
        if (row.kind === "comment") { rowsEl.appendChild(el("div", "ge-comment", "// " + row.text)); return; }
        rowsEl.appendChild(buildRow(row, i, nums[i], ghosts[i], nts));
      });
      if (!model.rows.some((r) => r.kind === "rule")) rowsEl.appendChild(el("div", "ge-empty", parseError ? "The grammar text has an error (see Text)." : "No productions. + Nonterminal starts one."));
      if (focus) {
        const target = rowsEl.querySelector('[data-i="' + focus.row + '"] ' + (focus.part === "lhs" ? ".ge-lhs" : ".ge-in"));
        if (target) target.focus();
      }
    }

    function chipKind(sym, nts) { return nts.has(sym) ? "ge-nt" : "ge-t"; }

    function buildRow(row, i, num, ghost, nts) {
      const d = el("div", "ge-row" + (row.enabled ? "" : " is-off") + (ghost ? " is-ghost" : "") + (row.rhs.length ? "" : " is-empty"));
      d.dataset.i = i;
      const n = el("span", "ge-num", num === null ? "" : String(num));
      n.title = num === null ? "" : "Production " + num;
      const lhs = el("input", "ge-lhs");
      lhs.value = gmLhsKey(row);
      lhs.size = Math.max(4, Math.min(16, lhs.value.length + 1));
      lhs.spellcheck = false;
      lhs.title = ghost ? "Written with |: the parser sees " + gmLhsKey(row) + " → … as a production of its own. Edit to give this production another left side." : "Left side";
      lhs.addEventListener("change", () => {
        const v = lhs.value.trim();
        if (!v) { lhs.value = gmLhsKey(row); return; }
        if (v !== gmLhsKey(row)) changed(gmUpdate(model, i, { lhs: v.split(/\s+/) }), { row: i, part: "lhs" });
      });
      lhs.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lhs.dispatchEvent(new Event("change")); focusEnd(i); } });
      // The arrow cell: the arrow, and in a row that repeats its left side the | it was written with. They share one
      // column, so the arrows of all rows are aligned and the | sits under them.
      const arrow = el("span", "ge-arrow");
      arrow.append(el("span", "ge-ar", model.arrow === "->" ? "→" : model.arrow));
      if (ghost) arrow.append(el("span", "ge-pipe", "|"));
      const rhs = el("span", "ge-rhs");
      row.rhs.forEach((s, k) => rhs.appendChild(buildChip(row, i, k, s, nts)));
      const inp = el("input", "ge-in");
      inp.spellcheck = false;
      inp.placeholder = row.rhs.length ? "" : "ε"; // an empty right side is ε
      inp.title = row.rhs.length ? "" : "Empty: the production derives the empty string";
      inp.size = 4;
      inp.addEventListener("input", () => { inp.size = Math.max(4, inp.value.length + 1); });
      inp.addEventListener("keydown", (e) => endKey(e, inp, i));
      inp.addEventListener("blur", () => { const v = inp.value.trim(); inp.value = ""; if (v) commitTyped(i, v, false); });
      rhs.appendChild(inp);
      const menu = el("button", "ge-menu", "⋯");
      menu.type = "button";
      menu.title = "Production menu";
      UI.menu(menu, () => [
        { label: row.enabled ? "Disable" : "Enable", onSelect: () => changed(gmUpdate(model, i, { enabled: !row.enabled })) },
        { label: "Duplicate", onSelect: () => changed(gmInsert(model, i + 1, JSON.parse(JSON.stringify(row))), { row: i + 1, part: "end" }) },
        { label: "Move up", disabled: i === 0, onSelect: () => changed(gmMove(model, i, -1)) },
        { label: "Move down", disabled: i === model.rows.length - 1, onSelect: () => changed(gmMove(model, i, 1)) },
        { separator: true },
        { label: "Delete", onSelect: () => changed(gmRemove(model, i)) },
      ], { align: "right" });
      d.append(n, lhs, arrow, rhs, menu);
      return d;
    }

    function buildChip(row, i, k, s, nts) {
      const open = !nts.has(s.sym) && ANGLE.test(s.sym) && !s.quoted;
      const c = el("span", "ge-chip " + chipKind(s.sym, nts) + (open ? " ge-open" : ""), s.sym);
      c.title = open ? s.sym + " has no production: read as a terminal" : s.quoted ? "Terminal, written in quotes" : nts.has(s.sym) ? "Nonterminal" : "Terminal";
      c.addEventListener("click", () => editChip(c, row, i, k, s));
      return c;
    }

    function editChip(chip, row, i, k, s) {
      const inp = el("input", "ge-chip-edit");
      inp.value = s.sym;
      inp.size = Math.max(2, s.sym.length + 1);
      inp.spellcheck = false;
      chip.replaceWith(inp);
      inp.focus();
      inp.select();
      let done = false;
      const finish = (cancel) => {
        if (done) return;
        done = true;
        if (cancel || inp.value === s.sym) { render({ row: i, part: "end" }); return; }
        let toks = [];
        try { toks = bnfAlternatives(inp.value)[0].toks; } catch (e) { render(); return; }
        const m = gmClone(model);
        m.rows[i].rhs.splice(k, 1, ...toks.map((t) => ({ sym: t.sym, quoted: t.quoted })));
        changed(m, { row: i, part: "end" });
      };
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); finish(false); }
        else if (e.key === "Escape") { e.preventDefault(); finish(true); }
      });
      inp.addEventListener("blur", () => finish(false));
    }

    function focusEnd(i) {
      const t = rowsEl.querySelector('[data-i="' + i + '"] .ge-in');
      if (t) t.focus();
    }
    function ruleRows() { return model.rows.map((r, i) => (r.kind === "rule" ? i : -1)).filter((i) => i >= 0); }

    // The typed text of the end field: symbols become chips, a | starts another production with the same left side.
    function commitTyped(i, str, keepFocus) {
      let alts;
      try { alts = bnfAlternatives(str); } catch (e) { return false; }
      const m = gmClone(model);
      let at = i;
      alts.forEach((a, idx) => {
        if (idx > 0) { m.rows.splice(at + 1, 0, gmNewRule(m.rows[at].lhs)); at++; }
        const r = m.rows[at];
        const solo = a.toks.length === 1 ? a.toks[0] : null;
        if (solo && !solo.quoted && GM_EPS.includes(solo.sym) && !r.rhs.length) { r.eps = solo.sym; return; }
        if (a.toks.length) r.eps = null;
        for (const t of a.toks) r.rhs.push({ sym: t.sym, quoted: t.quoted });
      });
      changed(m, keepFocus ? { row: at, part: "end" } : null);
      return true;
    }

    function endKey(e, inp, i) {
      const row = model.rows[i];
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (e.altKey) { e.preventDefault(); const j = i + (e.key === "ArrowUp" ? -1 : 1); if (j >= 0 && j < model.rows.length) changed(gmMove(model, i, j < i ? -1 : 1), { row: j, part: "end" }); return; }
        const rr = ruleRows(), at = rr.indexOf(i), j = rr[at + (e.key === "ArrowUp" ? -1 : 1)];
        if (j !== undefined) { e.preventDefault(); focusEnd(j); }
        return;
      }
      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
      if (e.key === "y" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doRedo(); return; }
      if (e.key === " " || e.key === "Enter") {
        const v = inp.value.trim();
        if (v) { e.preventDefault(); inp.value = ""; commitTyped(i, v, true); return; }
        if (e.key === "Enter") {
          e.preventDefault();
          changed(gmInsert(model, i + 1, gmNewRule(row.lhs)), { row: i + 1, part: "end" });
        } else if (e.key === " ") e.preventDefault();
        return;
      }
      if (e.key === "Backspace" && inp.value === "") {
        if (row.rhs.length) { e.preventDefault(); const m = gmClone(model); m.rows[i].rhs.pop(); changed(m, { row: i, part: "end" }); }
        else if (ruleRows().length > 1) {
          e.preventDefault();
          const prev = ruleRows().filter((j) => j < i).pop();
          changed(gmRemove(model, i), { row: prev === undefined ? 0 : prev, part: "end" });
        }
      }
    }

    // ── The footer ──
    addRule.addEventListener("click", () => {
      const rr = ruleRows();
      const last = rr.length ? model.rows[rr[rr.length - 1]] : null;
      changed(gmInsert(model, model.rows.length, gmNewRule(last ? last.lhs : "S")), { row: model.rows.length, part: "end" });
    });
    addNt.addEventListener("click", () => {
      const used = new Set(model.rows.filter((r) => r.kind === "rule").flatMap((r) => r.lhs));
      let name = "A";
      for (let c = 65; c <= 90 && used.has(name); c++) name = String.fromCharCode(c);
      for (let k = 1; used.has(name); k++) name = "N" + k;
      changed(gmInsert(model, model.rows.length, gmNewRule(name)), { row: model.rows.length, part: "lhs" });
    });
    host.addEventListener("keydown", (e) => {
      if (e.target === textEl) return;
      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    });

    readText(nativeValue.get.call(textarea));
    render();
    return { setView, undo: doUndo, redo: doRedo, model: () => model };
  }

  return { attach };
})();
