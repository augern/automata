// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "NFA simulator",
  intro: "Define a nondeterministic finite automaton, with ε-moves if you like, and see how it processes a string. An NFA can be in several states at once, so the simulation shows every possible computation as a tree.",
  use: [
    "Each row of the table is a state and each column an input symbol (plus ε). A cell lists the states reached, separated by commas; leave it blank for no move.",
    "Pick the start state with → and the accepting states with ★. + State and + Symbol grow the automaton.",
    "Type a string (or use the dice, or ▾ for examples) and step through it. The string is accepted if some path ends in an accepting state.",
    "Click a node of the tree for an explanation of that configuration.",
  ],
  notation: [
    ["ε-closure", "all states reachable from a state by ε-moves alone, the state itself included"],
    ["tree node", "a state the NFA can be in after reading the input up to that depth"],
    ["edge label", "the symbol read; ε marks ε-moves taken on the way"],
  ],
  legend: [
    ["blue", "start state; at run time, the states the NFA is in now"],
    ["green", "accepting state, and the path that accepts"],
    ["red", "a branch that ended in a non-accepting state"],
    ["grey", "a dead branch: no move was possible (✗)"],
  ],
};
