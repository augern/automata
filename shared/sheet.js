// A sheet that slides up above the tab bar on a phone (mobile.css): a title, a row of chips and a Done button.
//   const sheet = createSheet({ onClose });
//   sheet.open({ title | titleHtml });        show it (and keep what is set)
//   sheet.set(chips, emptyText);              chips: [{ label | html, on?, title?, pick }]; pick() runs when a chip is tapped
//   sheet.entry({ placeholder, add } | null); a small text field with an Add button under the chips, for what the chips lack; add(text)
//   sheet.close();                            hide it from code (onClose is not called)
// Done, or a tap outside the sheet, hides it and calls onClose, so the page can drop what the sheet was for.
function createSheet(spec = {}) {
  const el = document.createElement("div");
  el.className = "sheet";
  el.hidden = true;
  el.innerHTML = '<div class="sheet__back"></div><div class="sheet__panel"><div class="sheet__head"><span class="sheet__title"></span><button type="button" class="btn sheet__done">Done</button></div><div class="sheet__chips"></div><div class="sheet__entry" hidden><input type="text" class="sheet__input" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="button" class="btn sheet__add">Add</button></div></div>';
  document.body.appendChild(el);
  const dismiss = () => { el.hidden = true; if (spec.onClose) spec.onClose(); };
  el.querySelector(".sheet__back").addEventListener("click", dismiss);
  el.querySelector(".sheet__done").addEventListener("click", dismiss);
  let adder = null;
  const input = el.querySelector(".sheet__input");
  const add = () => { const v = input.value.trim(); if (v && adder) { input.value = ""; adder(v); } };
  el.querySelector(".sheet__add").addEventListener("click", add);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  return {
    entry(spec) {
      adder = spec ? spec.add : null;
      el.querySelector(".sheet__entry").hidden = !spec;
      if (spec) { input.placeholder = spec.placeholder || ""; input.value = ""; }
    },
    open({ title = "", titleHtml = null } = {}) {
      const t = el.querySelector(".sheet__title");
      if (titleHtml !== null) t.innerHTML = titleHtml; else t.textContent = title;
      el.hidden = false;
    },
    set(chips, emptyText = "") {
      const box = el.querySelector(".sheet__chips");
      box.innerHTML = "";
      if (!chips.length && emptyText) { const e = document.createElement("span"); e.className = "sheet__empty"; e.textContent = emptyText; box.appendChild(e); }
      for (const c of chips) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sheet-chip" + (c.on ? " is-on" : "");
        if (c.html !== undefined) b.innerHTML = c.html; else b.textContent = c.label;
        if (c.title) b.title = c.title;
        b.setAttribute("aria-pressed", String(!!c.on));
        b.addEventListener("click", c.pick);
        box.appendChild(b);
      }
    },
    close() { el.hidden = true; },
  };
}
