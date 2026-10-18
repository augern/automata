// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Regular expressions",
  intro: "Converts a regular expression to an NFA (Thompson's construction), a DFA (subset construction) and a minimal DFA (minimisation), one panel per stage, and runs strings on the result.",
  use: [
    "Enter an expression. Operators: `|` union, `*` star, `+` one or more, `?` optional, `( )` grouping, `.` any symbol.",
    "Step › advances a stage one step at a time; ▶| completes it.",
    "Thompson stage: the expression marks what each step builds (operator boxed, operands tinted). The diagram under the table shows the fragments being combined; the transitions added by the step are amber, and boxed in the table.",
    "Simulation panel: enter a string, or pick one with the dice (random accepted string) or ▾ (examples).",
    "Apply / Skip in the Minimisation panel selects whether the graph and the simulation use the minimal DFA. Apply / Skip in the Subset Construction panel selects the DFA or the Thompson NFA; until the construction has been stepped to its end, the NFA is used. Graphs over 80 states or 300 transitions are not drawn.",
    "Error state (Simulation panel) adds an explicit state err to the graph and the simulation: a state with no transition on a symbol goes to err, which absorbs the rest of the input. The red ? stands for every symbol outside the alphabet.",
    "The graph shows the DFA once subset construction is complete. Hovering a state or edge marks the matching row or cell of the subset-construction table.",
  ],
  notation: [
    ["q0, q1, …", "states of the NFA"],
    ["D0, D1, …", "states of the DFA from subset construction; each stands for a set of NFA states"],
    ["M0, M1, …", "states of the minimal DFA; each stands for a group of D states that behave the same (shown after minimisation)"],
    ["ε", "the empty string, or a move that reads no input"],
    ["i, f", "the start and accept state of the fragment being built (Thompson table and diagram)"],
    ["→  *", "start state, accepting state"],
    ["blank cell", "no transition (the move leads to the empty set)"],
    ["✗  ≡", "in the minimisation table: a pair of states that can be told apart / that are equivalent"],
  ],
  legend: [
    ["blue", "start state, or the state the simulation is in"],
    ["green", "accepting state"],
    ["red", "the string was rejected"],
  ],
};
