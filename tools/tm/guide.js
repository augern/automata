// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Turing machine",
  intro: "Defines a deterministic single-tape Turing machine and runs it on an input string, showing the tape, the head and the computation.",
  use: [
    "Each row is a state and each column the symbol under the head (□ is the blank). A cell reads `next, write, move`: `q1,X,R` means go to q1, write X, move right.",
    "Use `_` for the blank. An empty cell means the machine halts and rejects.",
    "Mark one accept (A) and one reject (R) state. The machine halts as soon as it reaches either.",
    "Step through, or run to the end. The table under the tape lists the steps.",
  ],
  notation: [
    ["□", "the blank symbol; the tape is blank beyond the input"],
    ["L / R", "move the head one cell left / right"],
    ["q1,X,R", "next state, symbol to write, head move"],
  ],
  legend: [
    ["blue", "start state, and the state the machine is in"],
    ["green", "accept state"],
    ["red", "reject state"],
  ],
};
