// Pure Turing machine algorithms: tape access and the pre-run of a
// deterministic TM. No DOM access.
//
// A TM is { states: string[], start, accept, reject (indices into states),
//   trans: { [state]: { [symbol]: { next, write, dir: "L"|"R" } } } }.
// A tape is a sparse Map<int, string>; absent cells hold TM_BLANK.

const TM_BLANK = "□";
const TM_MAX_STEPS = 1000;

function tmTapeRead(tape, pos) {
  return tape.has(pos) ? tape.get(pos) : TM_BLANK;
}

function tmTapeWrite(tape, pos, sym) {
  if (sym === TM_BLANK) tape.delete(pos); // keep map sparse
  else tape.set(pos, sym);
}

// Config: { tape: Map, head, state,
//           action: null | { fromState, sym, write, dir } | { implicit: true, fromState, sym } }
// Missing transitions are an implicit move to the reject state ("implicit" action).
// Returns { configs, didNotHalt }; didNotHalt means maxSteps was reached.
function tmBuildConfigs(tm, inputStr, maxSteps = TM_MAX_STEPS) {
  const tape = new Map();
  for (let i = 0; i < inputStr.length; i++) tape.set(i, inputStr[i]);

  const acceptName = tm.states[tm.accept];
  const rejectName = tm.states[tm.reject];
  const isHalt = (s) => s === acceptName || s === rejectName;

  let head = 0;
  let state = tm.states[tm.start];
  const configs = [{ tape: new Map(tape), head, state, action: null }];

  let halted = isHalt(state); // a machine that starts in a halting state halts at once
  for (let step = 0; step < maxSteps && !halted; step++) {
    const sym = tmTapeRead(tape, head);
    const trans = tm.trans[state]?.[sym];

    if (!trans) {
      const prevState = state;
      state = rejectName;
      configs.push({ tape: new Map(tape), head, state, action: { implicit: true, fromState: prevState, sym } });
      halted = true;
      break;
    }

    const fromState = state;
    tmTapeWrite(tape, head, trans.write);
    state = trans.next;
    head += trans.dir === "R" ? 1 : -1;
    configs.push({ tape: new Map(tape), head, state, action: { fromState, sym, write: trans.write, dir: trans.dir } });

    if (isHalt(state)) halted = true;
  }

  return { configs, didNotHalt: !halted };
}

// Convenience: run to completion. outcome is "accept" | "reject" | "limit".
// `tape` is the non-blank span of the final tape as a string.
function tmRun(tm, inputStr, maxSteps = TM_MAX_STEPS) {
  const { configs, didNotHalt } = tmBuildConfigs(tm, inputStr, maxSteps);
  const last = configs[configs.length - 1];
  const outcome = didNotHalt ? "limit" : last.state === tm.states[tm.accept] ? "accept" : "reject";
  const cells = [...last.tape.keys()].sort((a, b) => a - b);
  let tape = "";
  if (cells.length) for (let i = cells[0]; i <= cells[cells.length - 1]; i++) tape += tmTapeRead(last.tape, i);
  return { outcome, steps: configs.length - 1, tape, head: last.head };
}
