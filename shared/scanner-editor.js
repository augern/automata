// The scanner editor: the token rules as a table, one row per rule, in place of a text area.
//
//   ScannerEditor.attach(textarea)  →  { render, flag, undo, redo }
//
// The text area stays the interface to the tool, as for the grammar editor: it is hidden and holds the rules as text;
// the editor writes the text into it (and dispatches "input") when a rule changes, and setting textarea.value from the
// tool redraws the editor. A Rules | Text switch is in the panel menu.
//
// A row: [priority] [name] [pattern] [menu]. The order is the priority: of two rules that match the same lexeme, the
// earlier wins. A rule that discards what it matches (white space, comments) shows `→ skip`; the menu switches it. The
// last row is always an empty entry for a new rule. A pattern that is not valid has its error under the row, and the
// tool can put notes under rows (flag). A row has data-tok = its rule number + 1, which links it with the same
// token rule in other views (see "Production and token links" in shared.js). Needs algo/grammar-model.js (the edits),
// algo/scanner-model.js, algo/scanner.js (pattern errors) and ui.js.
const ScannerEditor = (() => {
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  function attach(textarea, opts) {
    opts = opts || {};
    let model = { rows: [] };
    let view = "rules";
    try { if (localStorage.getItem("parser-tools-scanner-view") === "text") view = "text"; } catch (e) { /* storage blocked */ }
    let undo = [], redo = [], parseError = "", flags = [];
    const numsKey = "parser-tools-scanner-nums";
    let numsChoice = null;
    const showNums = () => (numsChoice !== null ? numsChoice : !document.body.classList.contains("is-mobile"));
    try { const v = localStorage.getItem(numsKey); if (v !== null) numsChoice = v === "1"; } catch (e) { /* storage blocked */ }

    const host = el("div", "se");
    textarea.parentNode.insertBefore(host, textarea);
    textarea.style.display = "none";
    const bar = el("div", "se-bar");
    const rowsEl = el("div", "se-rows");
    const textEl = el("textarea", "se-text");
    textEl.spellcheck = false;
    host.append(bar, rowsEl, textEl);

    const text = () => smToText(model);
    const readText = (t) => { try { model = smParse(t); parseError = ""; } catch (e) { parseError = e.message; } };
    function write() {
      nativeValue.set.call(textarea, text());
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    function changed(newModel, focus) {
      undo.push(JSON.stringify(model));
      if (undo.length > 100) undo.shift();
      redo = [];
      model = newModel;
      parseError = "";
      write();
      render(focus);
    }
    function restore(json) { model = JSON.parse(json); write(); render(); }
    const doUndo = () => { if (undo.length) { redo.push(JSON.stringify(model)); restore(undo.pop()); } };
    const doRedo = () => { if (redo.length) { undo.push(JSON.stringify(model)); restore(redo.pop()); } };

    // The tool sets textarea.value (examples, shared links): follow it.
    Object.defineProperty(textarea, "value", {
      configurable: true,
      get() { return nativeValue.get.call(this); },
      set(v) { nativeValue.set.call(this, v); undo = []; redo = []; readText(String(v)); render(); },
    });

    function setView(v) {
      view = v;
      try { localStorage.setItem("parser-tools-scanner-view", v); } catch (e) { /* storage blocked */ }
      render();
    }
    const panel = textarea.closest(".panel");
    if (panel) panelMenuExtras[panel.id] = () => [
      { heading: "Rules view" },
      { label: "Rules", checked: view === "rules", title: "The token rules as a table", onSelect: () => setView("rules") },
      { label: "Text", checked: view === "text", title: "The token rules as plain text", onSelect: () => setView("text") },
      { separator: true },
      { label: "Priority numbers", checked: showNums(), title: "The position of a rule is its priority: on a tie, a lower number wins", onSelect: () => {
        numsChoice = !showNums();
        try { localStorage.setItem(numsKey, numsChoice ? "1" : "0"); } catch (e) { /* storage blocked */ }
        render();
      } },
    ];
    document.addEventListener("mobilechange", () => render());
    textEl.addEventListener("input", () => {
      nativeValue.set.call(textarea, textEl.value);
      readText(textEl.value);
      bar.textContent = parseError;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // A typed change is written through without a redraw (which would drop the focus): one undo step per visit.
    function quiet(i, props, dirty) {
      if (!dirty.on) { undo.push(JSON.stringify(model)); if (undo.length > 100) undo.shift(); redo = []; dirty.on = true; }
      Object.assign(model.rows[i], props);
      parseError = "";
      write();
    }

    // Notes from the tool: [{ rule, text, kind: "warn" | "info" }], rule counting the enabled rules from 0.
    function flag(list) { flags = list || []; if (view === "rules") drawNotes(); }
    function drawNotes() {
      rowsEl.querySelectorAll(".se-note").forEach((e) => e.remove());
      for (const row of rowsEl.querySelectorAll(".se-row[data-live]")) {
        const i = +row.dataset.i, r = model.rows[i];
        const msgs = [];
        const err = typeof scnPatternError === "function" && r.pattern.trim() ? scnPatternError(r.pattern) : null;
        if (err) msgs.push({ kind: "error", text: err });
        for (const f of flags) if (f.rule === +row.dataset.live) msgs.push(f);
        row.classList.toggle("is-bad", !!err);
        msgs.forEach((m) => { const n = el("div", "se-note is-" + m.kind, m.text); row.appendChild(n); });
      }
    }

    function render(focus) {
      host.classList.toggle("no-nums", !showNums());
      rowsEl.style.display = view === "rules" ? "" : "none";
      textEl.style.display = view === "text" ? "" : "none";
      bar.textContent = parseError;
      bar.style.display = parseError ? "" : "none";
      if (view === "text") { if (document.activeElement !== textEl) textEl.value = nativeValue.get.call(textarea); return; }
      rowsEl.innerHTML = "";
      const idx = smIndexes(model);
      model.rows.forEach((row, i) => {
        if (row.kind === "comment") { rowsEl.appendChild(el("div", "se-comment", "// " + row.text)); return; }
        rowsEl.appendChild(buildRow(row, i, idx[i]));
      });
      rowsEl.appendChild(buildNewRow());
      drawNotes();
      if (focus) {
        const t = rowsEl.querySelector('[data-i="' + focus.row + '"] ' + (focus.part === "name" ? ".se-name" : ".se-pat"));
        if (t) t.focus();
      }
    }

    function focusRow(i, part) {
      const t = rowsEl.querySelector('[data-i="' + i + '"] ' + (part === "name" ? ".se-name" : ".se-pat"));
      if (t) t.focus();
    }
    const ruleRows = () => model.rows.map((r, i) => (r.kind === "rule" ? i : -1)).filter((i) => i >= 0);

    // keys shared by the fields of a row (i: the row index; the entry row is model.rows.length)
    function rowKeys(e, i) {
      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return true; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const all = [...ruleRows(), model.rows.length], at = all.indexOf(i), j = all[at + (e.key === "ArrowUp" ? -1 : 1)];
        if (e.altKey && i < model.rows.length) {
          const k = i + (e.key === "ArrowUp" ? -1 : 1);
          if (k >= 0 && k < model.rows.length) { e.preventDefault(); changed(gmMove(model, i, k < i ? -1 : 1), { row: k, part: e.target.classList.contains("se-name") ? "name" : "pat" }); }
          return true;
        }
        if (j !== undefined) { e.preventDefault(); focusRow(j, e.target.classList.contains("se-name") ? "name" : "pat"); }
        return true;
      }
      return false;
    }

    function buildRow(row, i, k) {
      const d = el("div", "se-row" + (row.enabled ? "" : " is-off") + (row.skip ? " is-skip" : "") + (i % 2 ? " is-odd" : ""));
      d.dataset.i = i;
      if (k !== null) { d.dataset.live = k; d.dataset.tok = k + 1; }
      const num = el("span", "se-num", k === null ? "" : String(k + 1));
      num.title = k === null ? "Disabled" : "Priority " + (k + 1) + ": on a tie, a lower number wins";
      const dirty = { on: false };
      const name = el("input", "se-name");
      name.value = row.name;
      name.spellcheck = false;
      name.size = Math.max(3, row.name.length + 1);
      name.title = "The token's name: the terminal the grammar uses";
      name.addEventListener("input", () => { name.size = Math.max(3, name.value.length + 1); quiet(i, { name: name.value }, dirty); });
      name.addEventListener("blur", () => { dirty.on = false; });
      name.addEventListener("keydown", (e) => { if (rowKeys(e, i)) return; if (e.key === "Enter") { e.preventDefault(); focusRow(i, "pat"); } });
      const cell = el("span", "se-patcell");
      const pat = el("input", "se-pat");
      pat.value = row.pattern;
      pat.spellcheck = false;
      pat.title = "A regular expression: | * + ? ( ) [a-z] [^…] . \\n \\t";
      pat.addEventListener("input", () => { quiet(i, { pattern: pat.value }, dirty); drawNotes(); });
      pat.addEventListener("blur", () => { dirty.on = false; });
      pat.addEventListener("keydown", (e) => { if (rowKeys(e, i)) return; if (e.key === "Enter") { e.preventDefault(); focusRow(model.rows.length, "name"); } });
      cell.appendChild(pat);
      if (row.skip) cell.appendChild(el("span", "se-skip", "→ skip"));
      const menu = el("button", "se-menu", "⋯");
      menu.type = "button";
      menu.title = "Rule menu";
      UI.menu(menu, () => [
        { label: row.enabled ? "Disable" : "Enable", onSelect: () => changed(gmUpdate(model, i, { enabled: !row.enabled })) },
        { label: row.skip ? "Return a token" : "Discard (skip)", title: "A skipped lexeme (white space, a comment) is consumed and no token is returned", onSelect: () => changed(gmUpdate(model, i, { skip: !row.skip })) },
        { label: "Duplicate", onSelect: () => changed(gmInsert(model, i + 1, JSON.parse(JSON.stringify(row))), { row: i + 1, part: "pat" }) },
        { label: "Move up", disabled: i === 0, onSelect: () => changed(gmMove(model, i, -1)) },
        { label: "Move down", disabled: i === model.rows.length - 1, onSelect: () => changed(gmMove(model, i, 1)) },
        { separator: true },
        { label: "Delete", onSelect: () => changed(gmRemove(model, i)) },
      ], { align: "right" });
      d.append(num, name, cell, menu);
      return d;
    }

    // The entry row: a rule is made when both fields are filled and Enter is pressed (or the pattern is left).
    function buildNewRow() {
      const at = model.rows.length;
      const d = el("div", "se-row se-new" + (at % 2 ? " is-odd" : ""));
      d.dataset.i = at;
      const name = el("input", "se-name");
      name.placeholder = "name";
      name.spellcheck = false;
      name.size = 5;
      name.title = "The token's name: the terminal the grammar uses";
      const cell = el("span", "se-patcell");
      const pat = el("input", "se-pat");
      pat.placeholder = "pattern";
      pat.spellcheck = false;
      cell.appendChild(pat);
      const make = (keep) => {
        const n = name.value.trim(), p = pat.value.trim();
        if (!n || !p) return false;
        const r = smNewRule(n, p);
        if (/^'.*'$/.test(n) && n.length > 2) { r.name = n.slice(1, -1).replace(/''/g, "'"); r.quoted = true; }
        changed(gmInsert(model, at, r), keep ? { row: at + 1, part: "name" } : null);
        return true;
      };
      name.addEventListener("keydown", (e) => { if (rowKeys(e, at)) return; if (e.key === "Enter") { e.preventDefault(); pat.focus(); } });
      pat.addEventListener("keydown", (e) => { if (rowKeys(e, at)) return; if (e.key === "Enter") { e.preventDefault(); make(true); } });
      pat.addEventListener("blur", () => { if (pat.value.trim() && name.value.trim()) make(false); });
      d.append(el("span", "se-num"), name, cell, el("span", "se-menu-gap"));
      return d;
    }

    host.addEventListener("keydown", (e) => {
      if (e.target === textEl) return;
      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    });

    readText(nativeValue.get.call(textarea));
    render();
    return { render, flag, undo: doUndo, redo: doRedo, model: () => model };
  }

  return { attach };
})();
