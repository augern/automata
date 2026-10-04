// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Regular expressions",
  intro: "Turns a regular expression into a finite automaton and runs strings on it. The construction happens in three stages, one panel each: Thompson's construction builds an NFA, subset construction turns it into a DFA, and minimization merges equivalent DFA states.",
  use: [
    "Type an expression on the left. Operators: `|` union, `*` star, `+` one or more, `?` optional, `( )` grouping, `.` any symbol.",
    "Step through each stage with Step ›, or press ▶| to finish it at once. The tables fill in as you go.",
    "In the Thompson stage, the expression highlights what each step builds (the operator boxed, the operands tinted), and the diagram under the table shows the fragments being combined, with the transitions this step adds in amber (also boxed in the table).",
    "Run a string in the Simulation panel: type one, use the dice for a random accepted string, or pick from ▾.",
    "The Apply / Skip switch in the Minimization panel decides whether the graph and the simulation use the minimal DFA.",
    "The DFA graph appears once subset construction is complete. Hover a state or edge of it to see the matching row or cell of the subset-construction table.",
  ],
  notation: [
    ["q0, q1, …", "states of the NFA"],
    ["D0, D1, …", "states of the DFA from subset construction; each stands for a set of NFA states"],
    ["M0, M1, …", "states of the minimal DFA; each stands for a group of D states that behave the same (shown once minimization has been carried out)"],
    ["ε", "the empty string, or a move that reads no input"],
    ["i, f", "the start and accept state of the fragment being built (Thompson table and diagram)"],
    ["→  *", "start state, accepting state"],
    ["∅", "no transition: the move leads to the empty set"],
    ["✗  ≡", "in the minimization table: a pair of states that can be told apart / that are equivalent"],
  ],
  legend: [
    ["blue", "start state, or the state the simulation is in"],
    ["green", "accepting state"],
    ["red", "the string was rejected"],
  ],
};
