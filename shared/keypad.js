// A row of keys that type into a text input at the caret, for a small notation that a phone keyboard is a poor fit for (the regular expression).
//   const pad = createKeypad("pad-id", { input: "input-id", keys: () => [{ label, insert?, action?, title?, kind? }] });
//   pad.render();     draw the keys again, after what keys() returns has changed
// insert: text put at the caret, replacing the selection; action: "backspace"; kind: "op" | "sym" | "del" styles the key.
// A key does not take the input's focus, and fires the input's own input event, so the page reacts as to typing.
const KEY_KIND = { sym: "kp-sym", op: "kp-op", del: "kp-del" };

function createKeypad(id, spec) {
  const box = document.getElementById(id), input = document.getElementById(spec.input);
  box.classList.add("kp");
  const press = (key) => {
    const a = input.selectionStart, b = input.selectionEnd, v = input.value;
    if (key.action === "backspace") {
      const from = a === b ? Math.max(0, a - 1) : a;
      input.value = v.slice(0, from) + v.slice(b);
      input.setSelectionRange(from, from);
    } else {
      input.value = v.slice(0, a) + key.insert + v.slice(b);
      input.setSelectionRange(a + key.insert.length, a + key.insert.length);
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  function render() {
    box.innerHTML = "";
    for (const k of spec.keys()) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "kp-key" + (KEY_KIND[k.kind] ? " " + KEY_KIND[k.kind] : "");
      b.textContent = k.label;
      if (k.title) b.title = k.title;
      b.addEventListener("mousedown", (e) => e.preventDefault()); // the input keeps focus and its caret
      b.addEventListener("click", () => press(k));
      box.appendChild(b);
    }
  }
  render();
  return { render };
}
