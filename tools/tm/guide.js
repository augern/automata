// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Turing machine",
  intro: "Defines a deterministic single-tape Turing machine and runs it on an input.",
  use: [
    "Rows are states, columns the symbol under the head (□ is the blank, typed `_`). A cell `q1,X,R` means: go to q1, write X, move right. An empty cell halts and rejects.",
    "Mark one accept (A) and one reject (R) state; the machine halts on reaching either.",
    "Step, or run to the end; the table under the tape lists the steps.",
  ],
  notation: [
    ["□", "the blank; the tape is blank beyond the input"],
    ["L / R", "move the head one cell left / right"],
  ],
  legend: [
    ["blue", "start state; the state the machine is in"],
    ["green", "accept state"],
    ["red", "reject state"],
  ],
};
