// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "NFA simulator",
  intro: "Defines a nondeterministic finite automaton, with optional ε-moves, and simulates it on a string. An NFA can be in several states at once; the simulation shows every computation as a tree.",
  use: [
    "Rows are states, columns are input symbols (and ε). A cell lists the states reached, comma-separated; an empty cell is no move.",
    "→ marks the start state, ★ the accepting states. + State and + Symbol extend the automaton.",
    "Enter a string (or use the dice or ▾) and step through it. The string is accepted if some path ends in an accepting state.",
    "Click a tree node to explain it: where it came from and what it means.",
    "Error state adds an explicit state err (also called the dead or trap state). A state with no move on a symbol (counting ε-moves) goes to err on it, and err absorbs the rest of the input. This describes one computation: other computations may still accept, and the tree shows err nodes next to them.",
    "A cell that names a state that does not exist is marked and ignored. The input is read one character at a time; a character outside the alphabet has no move (it is listed under the input).",
  ],
  notation: [
    ["ε-closure", "all states reachable from a state by ε-moves alone, the state itself included"],
    ["δ(q, a)", "the set of states reached from q on a: a cell of the table; ε is not an input symbol"],
    ["stuck", "a computation with no move on the next symbol: it ends there. It is not the error state, which is an extra state that only the Error option adds"],
    ["error state", "an extra non-accepting state that every missing move leads to, and that moves to itself on every symbol (also the dead or trap state)"],
    ["the NFA is in {…}", "the set of states after the symbols read, ε-closed: all the nodes at that depth"],
    ["tree node", "a state the NFA can be in after reading the input up to that depth; the start node stands for the start state, its ε-closure is in the log"],
    ["edge label", "the symbol read; ε marks ε-moves taken on the way"],
    ["?", "(red) every symbol outside the alphabet, and, with the symbols listed beside it, the error move of a state"],
  ],
  legend: [
    ["blue", "start state; at run time, the states the NFA is in now (the ε-closure included)"],
    ["green", "accepting state, and the path that accepts"],
    ["red", "a branch that ended in a non-accepting state; the error state"],
    ["grey", "a stuck branch: no move on the symbol just read (✗)"],
  ],
};
