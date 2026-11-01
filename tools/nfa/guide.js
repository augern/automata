// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "NFA simulator",
  intro: "Defines an NFA with optional ε-moves and simulates it on a string; the computation tree shows every path.",
  use: [
    "Rows are states, columns input symbols and ε; a cell lists the states reached. → marks the start state, ★ the accepting states.",
    "Enter a string (dice, ▾) and step through it. Click a tree node to explain it.",
    "Error state adds an explicit state err that every missing move leads to and that absorbs the rest of the input. It describes one computation; others may still accept.",
    "A cell naming a state that does not exist is marked and ignored. A character outside the alphabet has no move.",
  ],
  notation: [
    ["{…}", "the set of states after the symbols read, ε-closed: the nodes at one depth"],
    ["edge label", "the symbol read; ε marks ε-moves taken on the way"],
    ["stuck", "a computation with no move on the next symbol; not the error state"],
    ["?", "(red) every symbol outside the alphabet; with symbols beside it, the error move of a state"],
  ],
  legend: [
    ["blue", "start state; the states the NFA is in now"],
    ["green", "accepting state; the path that accepts"],
    ["red", "a branch that ended in a non-accepting state; the error state"],
    ["grey", "a stuck branch (✗)"],
  ],
};
