// Back / Step / Reset / Run-all control logic for pre-computed simulations.
// Loaded after shared.js by tools that step through a recorded history.
//
//   const sim = createStepper({
//     buttons: { reset: "btn-sim-reset", back: "btn-sim-back", step: "btn-sim-step", all: "btn-sim-all" },
//     min: 0,                       // position before the first step (-1 = "not started" state)
//     last: () => history.length ? history.length - 1 : null,   // null = nothing recorded
//     onChange: (pos) => render(),  // called after every move; buttons refresh afterwards
//   });
//
// sim.pos is a plain property: tools set it directly when they (re)build the
// history (then call render and sim.refresh()).
function createStepper({ buttons, min = 0, last, onChange }) {
  const el = (id) => document.getElementById(id);
  const s = {
    pos: min,
    refresh() {
      const end = last();
      const has = end !== null;
      el(buttons.reset).disabled = !has || s.pos <= min;
      el(buttons.back).disabled = !has || s.pos <= min;
      el(buttons.step).disabled = !has || s.pos >= end;
      el(buttons.all).disabled = !has || s.pos >= end;
    },
    go(pos) {
      s.pos = pos;
      onChange(pos);
      s.refresh();
    },
    next() {
      const end = last();
      if (end === null || s.pos >= end) return;
      s.go(s.pos + 1);
    },
    prev() {
      if (last() === null || s.pos <= min) return;
      s.go(s.pos - 1);
    },
    reset() {
      if (last() === null) return;
      s.go(min);
    },
    end() {
      const end = last();
      if (end === null) return;
      s.go(end);
    },
  };
  return s;
}
