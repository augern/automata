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

  function attach(textarea, opts) {
    opts = opts || {};
    let model = { arrow: "->", rows: [] };
    // production numbers: shown by default where the tool says so (opts.numbers); the panel menu changes it, per tool
    const numsKey = "parser-tools-grammar-nums:" + location.pathname;
    let view = "rules", showNums = !!opts.numbers;
    try { const v = localStorage.getItem(numsKey); if (v !== null) showNums = v === "1"; } catch (e) { /* storage blocked */ }
    try { if (localStorage.getItem("parser-tools-grammar-view") === "text") view = "text"; } catch (e) { /* storage blocked */ }
    let undo = [], redo = [];
    let parseError = "";

    const host = el("div", "ge");
    textarea.parentNode.insertBefore(host, textarea);
    textarea.style.display = "none";

    const bar = el("div", "ge-bar");
    const status = el("span", "ge-status");
    bar.append(status);
    const rowsEl = el("div", "ge-rows");
    const textEl = el("textarea", "ge-text");
    textEl.spellcheck = false;
    host.append(bar, rowsEl, textEl);

    // ── State and text ──
    const text = () => gmToText(model, opts);
    function readText(t) {
      try { model = gmParse(t, opts); parseError = ""; } catch (e) { parseError = e.message; }
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

    // the panel's menu switches between the table and the text
    const panel = textarea.closest(".panel");
    if (panel) panelMenuExtras[panel.id] = () => [
      { heading: "Grammar view" },
      { label: "Rules", checked: view === "rules", title: "The grammar as a table of productions", onSelect: () => setView("rules") },
      { label: "Text", checked: view === "text", title: "The grammar as plain text", onSelect: () => setView("text") },
      { separator: true },
      { label: "Production numbers", checked: showNums, title: "The numbers used in the tables", onSelect: () => {
        showNums = !showNums;
        try { localStorage.setItem(numsKey, showNums ? "1" : "0"); } catch (e) { /* storage blocked */ }
        render();
      } },
    ];

    // Text view
    textEl.addEventListener("input", () => {
      nativeValue.set.call(textarea, textEl.value);
      readText(textEl.value);
      status.textContent = parseError;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // ── Rendering ──
    function render(focus) {
      host.classList.toggle("no-nums", !showNums);
      rowsEl.style.display = view === "rules" ? "" : "none";
      textEl.style.display = view === "text" ? "" : "none";
      status.textContent = parseError;
      bar.style.display = parseError ? "" : "none";
      if (view === "text") { if (document.activeElement !== textEl) textEl.value = nativeValue.get.call(textarea); return; }
      rowsEl.innerHTML = "";
      const nts = gmNonterminals(model), nums = gmNumbers(model), ghosts = gmGhosts(model);
      // unrestricted grammars: the capitalised symbols of a longer left side are nonterminals too
      if (opts.sequences) for (const r of model.rows) if (gmLive(r) && r.lhs.length > 1) r.lhs.filter((x) => /^[A-Z]/.test(x)).forEach((x) => nts.add(x));
      model.rows.forEach((row, i) => {
        if (row.kind === "comment") { rowsEl.appendChild(el("div", "ge-comment", "// " + row.text)); return; }
        rowsEl.appendChild(buildRow(row, i, nums[i], ghosts[i], nts, row.kind === "rule" && !ghosts[i + 1]));
      });
      rowsEl.appendChild(buildNewRow());
      rowsEl.querySelectorAll(".ge-lhs").forEach(fitLhs);
      applyMarks();
      if (focus) {
        const target = rowsEl.querySelector('[data-i="' + focus.row + '"] ' + (focus.part === "lhs" ? ".ge-lhs, .ge-lhs-in" : focus.part === "action" ? ".ge-action-in" : ".ge-in"));
        if (target) target.focus();
      }
    }

    // A left-side field is as wide as its text (an input's size attribute counts average characters, which leaves room
    // at the end): measured in a span with the field's font.
    const ruler = el("span", "ge-ruler");
    host.appendChild(ruler);
    function fitLhs(inp) {
      const cs = getComputedStyle(inp);
      ruler.style.font = cs.font;
      ruler.textContent = inp.value || inp.placeholder;
      inp.style.width = Math.ceil(ruler.getBoundingClientRect().width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2 + "px";
    }

    // Marks from the tool: [{ rule, part: "lhs" | "rhs" | "sym", k, cls }], rule counting the enabled productions from 0.
    // The class is added to the left side, the right side or the k-th symbol of that production (a repeated left side
    // is marked in the first row of its group, where it is shown). [] clears them. Kept over redraws.
    let marks = [];
    function applyMarks() {
      rowsEl.querySelectorAll("[data-mark]").forEach((e) => { e.className = e.className.replace(/\bgh-\S+/g, "").trim(); e.removeAttribute("data-mark"); });
      const add = (e, cls) => { if (e) { cls.split(" ").forEach((c) => e.classList.add(c)); e.dataset.mark = "1"; } };
      for (const m of marks) {
        const row = rowsEl.querySelector('.ge-row[data-live="' + m.rule + '"]');
        if (!row) continue;
        if (m.part === "lhs") {
          let r = row;
          while (r.classList.contains("is-ghost") && r.previousElementSibling) r = r.previousElementSibling;
          add(r.querySelector(".ge-lhs, .ge-lhsq"), m.cls);
        } else if (m.part === "rhs") add(row.querySelector(".ge-rhs"), m.cls);
        else add(row.querySelectorAll(".ge-rhs .ge-chip")[m.k], m.cls);
      }
    }
    function mark(list) { marks = list || []; if (view === "rules") applyMarks(); }

    function chipKind(sym, nts) { return nts.has(sym) ? "ge-nt" : "ge-t"; }

    function buildRow(row, i, num, ghost, nts, last) {
      const d = el("div", "ge-row" + (row.enabled ? "" : " is-off") + (ghost ? " is-ghost" : "") + (last ? " is-last" : "") + (i % 2 ? " is-odd" : "") + (row.rhs.length ? "" : " is-empty"));
      d.dataset.i = i;
      if (num !== null) d.dataset.live = num - 1;
      // the number the tool uses for this production (opts.base: that of the first one, a number or a function; 0 is the
      // added start production where the tool has one); views mark it with data-prod
      const first = typeof opts.base === "function" ? opts.base() : opts.base === undefined ? 1 : opts.base;
      const shown = num === null ? null : num - 1 + first;
      if (shown !== null) d.dataset.prod = shown;
      const n = el("span", "ge-num", shown === null ? "" : String(shown));
      n.title = shown === null ? "" : "Production " + shown;
      const lhs = opts.sequences ? buildLhsSeq(row, i, ghost, nts) : buildLhsInput(row, i, ghost);
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
      const hasAction = opts.actions && row.action !== undefined && row.action !== null;
      UI.menu(menu, () => [
        { label: row.enabled ? "Disable" : "Enable", onSelect: () => changed(gmUpdate(model, i, { enabled: !row.enabled })) },
        ...(opts.actions ? [hasAction
          ? { label: "Remove action", onSelect: () => changed(gmUpdate(model, i, { action: null })) }
          : { label: "Add action", title: "Code run when the parser reduces by this production", onSelect: () => changed(gmUpdate(model, i, { action: "" }), { row: i, part: "action" }) }] : []),
        { label: "Duplicate", onSelect: () => changed(gmInsert(model, i + 1, JSON.parse(JSON.stringify(row))), { row: i + 1, part: "end" }) },
        { label: "Move up", disabled: i === 0, onSelect: () => changed(gmMove(model, i, -1)) },
        { label: "Move down", disabled: i === model.rows.length - 1, onSelect: () => changed(gmMove(model, i, 1)) },
        { separator: true },
        { label: "Delete", onSelect: () => changed(gmRemove(model, i)) },
      ], { align: "right" });
      d.append(n, lhs, arrow, rhs, menu);
      if (hasAction) {
        d.appendChild(buildAction(row, i));
        // pointing at a symbol marks where the action refers to it
        const refs = (n, on) => d.querySelectorAll('.ge-tok[data-ref="' + n + '"]').forEach((t) => t.classList.toggle("is-on", on));
        const watch = (e, n) => { e.addEventListener("mouseenter", () => refs(n, true)); e.addEventListener("mouseleave", () => refs(n, false)); };
        watch(lhs, "0");
        rhs.querySelectorAll(".ge-chip").forEach((c, k) => watch(c, String(k + 1)));
      }
      return d;
    }

    // the left side as one text field
    function buildLhsInput(row, i, ghost) {
      const lhs = el("input", "ge-lhs");
      lhs.value = gmLhsKey(row);
      lhs.size = Math.max(4, Math.min(16, lhs.value.length + 1));
      lhs.spellcheck = false;
      lhs.title = ghost ? "Written with |: the parser sees " + gmLhsKey(row) + " → … as a production of its own. Edit to give this production another left side." : "Left side";
      lhs.addEventListener("input", () => fitLhs(lhs));
      lhs.addEventListener("change", () => {
        const v = lhs.value.trim();
        if (!v) { lhs.value = gmLhsKey(row); return; }
        if (v !== gmLhsKey(row)) changed(gmUpdate(model, i, { lhs: v.split(/\s+/) }), { row: i, part: "lhs" });
      });
      lhs.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lhs.dispatchEvent(new Event("change")); focusEnd(i); } });
      return lhs;
    }

    // The left side as a sequence of symbols, in the format of the right side (unrestricted grammars): chips, and a field
    // after them for more.
    function buildLhsSeq(row, i, ghost, nts) {
      const box = el("span", "ge-lhsq");
      box.title = ghost ? "Written with |: a production of its own to the parser. Edit to give it another left side." : "Left side";
      const setLhs = (syms, part) => changed(gmUpdate(model, i, { lhs: syms }), { row: i, part });
      row.lhs.forEach((sym, k) => {
        const c = el("span", "ge-chip " + chipKind(sym, nts), sym);
        c.addEventListener("click", () => {
          const inp = el("input", "ge-chip-edit");
          inp.value = sym;
          inp.size = Math.max(2, sym.length + 1);
          inp.spellcheck = false;
          c.replaceWith(inp);
          inp.focus();
          inp.select();
          let done = false;
          const finish = (cancel) => {
            if (done) return;
            done = true;
            const parts = inp.value.trim().split(/\s+/).filter(Boolean);
            const next = row.lhs.slice(0, k).concat(parts, row.lhs.slice(k + 1));
            if (cancel || !next.length || next.join(" ") === row.lhs.join(" ")) { render({ row: i, part: "end" }); return; }
            setLhs(next, "end");
          };
          inp.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); finish(false); }
            else if (e.key === "Escape") { e.preventDefault(); finish(true); }
          });
          inp.addEventListener("blur", () => finish(false));
        });
        box.appendChild(c);
      });
      const inp = el("input", "ge-lhs-in");
      inp.spellcheck = false;
      inp.size = 2;
      inp.title = "More symbols on the left side";
      inp.addEventListener("input", () => { inp.size = Math.max(2, inp.value.length + 1); });
      inp.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          const v = inp.value.trim();
          if (v) { inp.value = ""; setLhs(row.lhs.concat(v.split(/\s+/)), "lhs"); } else if (e.key === "Enter") focusEnd(i);
        } else if (e.key === "Backspace" && inp.value === "" && row.lhs.length > 1) {
          e.preventDefault();
          setLhs(row.lhs.slice(0, -1), "lhs");
        }
      });
      inp.addEventListener("blur", () => { const v = inp.value.trim(); inp.value = ""; if (v) setLhs(row.lhs.concat(v.split(/\s+/)), "end"); });
      box.appendChild(inp);
      return box;
    }

    // An action is written on one line; shown a statement per line: a break after each ; outside quotes.
    function breakStatements(str) {
      let out = "", q = null;
      for (let k = 0; k < str.length; k++) {
        const c = str[k];
        if (q) { if (c === q) q = null; out += c; continue; }
        if (c === "'" || c === '"') { q = c; out += c; continue; }
        if (c === ";") {
          out += ";";
          let j = k + 1;
          while (j < str.length && /[ \t\n]/.test(str[j])) j++;
          if (j < str.length) { out += "\n"; k = j - 1; }
          continue;
        }
        out += c;
      }
      return out;
    }

    // The action of a production: a panel below its row, one line of text (it is written on one line: {{ … }})
    function buildAction(row, i) {
      const box = el("div", "ge-action");
      const label = el("span", "ge-action-label", "{ }");
      label.title = "Action: code run when the parser reduces by this production";
      box.appendChild(label);
      const ta = el("textarea", "ge-action-in");
      ta.rows = 1;
      ta.title = "One statement per line; written on one line in the text view";
      ta.spellcheck = false;
      ta.value = breakStatements(row.action);
      ta.placeholder = opts.actionHint || "$$ = $1";
      const fit = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
      let dirty = false;
      ta.addEventListener("input", () => {
        // re-break after typing a ;, keeping the caret before the same text
        const broken = breakStatements(ta.value);
        if (broken !== ta.value) {
          const before = ta.value.slice(0, ta.selectionStart).replace(/\s/g, "").length;
          ta.value = broken;
          let n = 0, pos = 0;
          while (pos < broken.length && n < before) { if (!/\s/.test(broken[pos])) n++; pos++; }
          ta.setSelectionRange(pos, pos);
        }
        fit();
        // typed text is written through without a redraw (which would drop the focus); one undo step per visit
        if (!dirty) { undo.push(JSON.stringify(model)); if (undo.length > 100) undo.shift(); redo = []; dirty = true; }
        model.rows[i].action = ta.value.replace(/\s*\n\s*/g, " ");
        parseError = "";
        nativeValue.set.call(textarea, text());
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      ta.addEventListener("blur", () => { dirty = false; });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); focusEnd(i); }
        else if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey) && !dirty) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      });
      // The $$ and $k in the text are linked with the symbols of the production: a mirror of the text behind the field
      // has a span for each, which is what the pointer is tested against. Pointing at one marks the symbol it names
      // (ge-ref); pointing at a symbol, left side or right side, marks its places in the text.
      const field = el("div", "ge-action-field");
      const mirror = el("div", "ge-mirror");
      mirror.setAttribute("aria-hidden", "true");
      const drawMirror = () => {
        mirror.innerHTML = ta.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\$\$|\$\d+/g, (m) => '<span class="ge-tok" data-ref="' + (m === "$$" ? "0" : m.slice(1)) + '">' + m + "</span>") + "\n";
      };
      const rowEl = () => box.closest(".ge-row");
      const clearRefs = () => {
        const r = rowEl();
        if (r) r.querySelectorAll(".ge-ref").forEach((e) => e.classList.remove("ge-ref"));
      };
      const refTarget = (r, n) => (n === "0" ? r.querySelector(".ge-lhs, .ge-lhsq") : r.querySelectorAll(".ge-rhs .ge-chip")[+n - 1]);
      ta.addEventListener("input", drawMirror);
      field.addEventListener("mousemove", (e) => {
        clearRefs();
        const r = rowEl();
        const hit = [...mirror.querySelectorAll(".ge-tok")].find((t) => [...t.getClientRects()].some((q) => e.clientX >= q.left && e.clientX <= q.right && e.clientY >= q.top && e.clientY <= q.bottom));
        const target = hit && r ? refTarget(r, hit.dataset.ref) : null;
        if (target) target.classList.add("ge-ref");
      });
      field.addEventListener("mouseleave", clearRefs);
      field.append(mirror, ta);
      box.appendChild(field);
      drawMirror();
      requestAnimationFrame(fit);
      return box;
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
    function commitTyped(i, str, keepFocus, base) {
      let alts;
      try { alts = bnfAlternatives(str); } catch (e) { return false; }
      const m = gmClone(base || model);
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
        else if (e.key === "ArrowDown" && at >= 0) { e.preventDefault(); focusEnd(model.rows.length); }
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

    // ── The entry row ──
    // Always the last row: not part of the model until something is typed in it. The left side defaults to that of the
    // last production (a new production for it); a new name starts a new group.
    function buildNewRow() {
      const at = model.rows.length;
      const rr = ruleRows();
      const dflt = rr.length ? gmLhsKey(model.rows[rr[rr.length - 1]]) : "S";
      const d = el("div", "ge-row ge-new" + (at % 2 ? " is-odd" : ""));
      d.dataset.i = at;
      // the left side typed so far: one text field, or in unrestricted grammars chips and a field after them
      const lhsIn = el("input", opts.sequences ? "ge-lhs-in" : "ge-lhs");
      lhsIn.placeholder = dflt;
      lhsIn.spellcheck = false;
      lhsIn.title = "Left side of a new production (empty: " + dflt + ")";
      const pending = [];
      let lhs = lhsIn;
      if (opts.sequences) {
        lhs = el("span", "ge-lhsq");
        lhs.appendChild(lhsIn);
        const drawPending = () => {
          lhs.querySelectorAll(".ge-chip").forEach((c) => c.remove());
          pending.forEach((sym, k) => {
            const c = el("span", "ge-chip " + chipKind(sym, gmNonterminals(model)), sym);
            c.addEventListener("click", () => { lhsIn.value = pending.splice(k).join(" "); drawPending(); lhsIn.focus(); });
            lhs.insertBefore(c, lhsIn);
          });
          lhsIn.placeholder = pending.length ? "" : dflt;
          lhsIn.size = Math.max(pending.length ? 2 : dflt.length + 1, lhsIn.value.length + 1);
        };
        lhsIn.size = dflt.length + 1;
        lhsIn.addEventListener("input", () => { lhsIn.size = Math.max(pending.length ? 2 : dflt.length + 1, lhsIn.value.length + 1); });
        lhsIn.addEventListener("keydown", (e) => {
          if (e.key === " ") {
            e.preventDefault();
            const v = lhsIn.value.trim();
            if (v) { pending.push(...v.split(/\s+/)); lhsIn.value = ""; drawPending(); }
          } else if (e.key === "Backspace" && lhsIn.value === "" && pending.length) {
            e.preventDefault();
            pending.pop();
            drawPending();
          }
        });
      } else lhsIn.addEventListener("input", () => fitLhs(lhsIn));
      const arrow = el("span", "ge-arrow");
      arrow.append(el("span", "ge-ar", model.arrow === "->" ? "→" : model.arrow));
      const rhs = el("span", "ge-rhs");
      const inp = el("input", "ge-in");
      inp.spellcheck = false;
      inp.placeholder = "ε";
      inp.title = "Right side of a new production: type its symbols";
      inp.size = 4;
      inp.addEventListener("input", () => { inp.size = Math.max(4, inp.value.length + 1); });
      // makes the entry row a production, with the symbols typed so far
      const start = (v) => {
        const typed = pending.concat(lhsIn.value.trim().split(/\s+/).filter(Boolean));
        const base = gmInsert(model, at, gmNewRule(typed.length ? typed : dflt.split(/\s+/)));
        if (v) commitTyped(at, v, true, base);
        else changed(base, { row: at, part: "end" });
      };
      lhsIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.focus(); } });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp") { const rr2 = ruleRows(); if (rr2.length) { e.preventDefault(); focusEnd(rr2[rr2.length - 1]); } return; }
        if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          const v = inp.value.trim();
          if (v) { inp.value = ""; start(v); } else if (e.key === "Enter") start("");
        }
      });
      inp.addEventListener("blur", () => { const v = inp.value.trim(); if (v) { inp.value = ""; start(v); } });
      rhs.appendChild(inp);
      d.append(el("span", "ge-num"), lhs, arrow, rhs, el("span", "ge-menu-gap"));
      return d;
    }
    host.addEventListener("keydown", (e) => {
      if (e.target === textEl) return;
      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    });

    readText(nativeValue.get.call(textarea));
    render();
    return { setView, render, mark, undo: doUndo, redo: doRedo, model: () => model };
  }

  return { attach };
})();
