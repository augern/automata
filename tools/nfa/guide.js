// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "NFA simulator",
  intro: "Defines a nondeterministic finite automaton, with optional ε-moves, and simulates it on a string. An NFA can be in several states at once; the simulation shows every computation as a tree.",
  use: [
    "Rows are states, columns are input symbols (and ε). A cell lists the states reached, comma-separated; an empty cell is no move.",
    "→ marks the start state, ★ the accepting states. + State and + Symbol extend the automaton.",
    "Enter a string (or use the dice or ▾) and step through it. The string is accepted if some path ends in an accepting state.",
    "Click a tree node to explain its configuration.",
    "Error state adds an explicit state err. A state with no move on a symbol (counting ε-moves) goes to err on it, and err absorbs the rest of the input. The tree shows this as a chain of err nodes.",
  ],
  notation: [
    ["ε-closure", "all states reachable from a state by ε-moves alone, the state itself included"],
    ["tree node", "a state the NFA can be in after reading the input up to that depth"],
    ["edge label", "the symbol read; ε marks ε-moves taken on the way"],
    ["?", "(red) every symbol outside the alphabet, and, with the symbols listed beside it, the error move of a state"],
  ],
  legend: [
    ["blue", "start state; at run time, the states the NFA is in now"],
    ["green", "accepting state, and the path that accepts"],
    ["red", "a branch that ended in a non-accepting state; the error state"],
    ["grey", "a dead branch: no move was possible (✗)"],
  ],
};
