// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Regular expressions",
  intro: "Converts a regular expression to an NFA (Thompson), a DFA (subset construction) and a minimal DFA (table filling), one panel per stage, and runs strings on the result.",
  use: [
    "The keys under the field type the symbols of the alphabet, the operators and ε; a symbol that the expression uses is added to the alphabet. Operators: `|` `*` `+` `?` `( )`. `ε` is the empty string, `\\x` the literal symbol x. Every other character is a symbol; there is no wildcard or character class.",
    "Step › advances a stage by one step; ▶| completes it.",
    "Thompson stage: the expression marks the step being built; the transitions it adds are amber and boxed in the table.",
    "Simulation: enter a string, or use the dice (random accepted string) or ▾ (shortest accepted strings).",
    "Apply / Skip chooses the automaton for the graph and the simulation: the minimal DFA (Minimisation panel), or the DFA or Thompson NFA (Subset Construction panel; the NFA until that stage is complete).",
    "Error state (Simulation panel) adds a state err that every missing transition leads to.",
    "Hovering a state or edge marks the matching row or cell of the subset-construction table.",
    "Not drawn: the pair table above 64 DFA states, graphs above 80 states or 300 transitions.",
  ],
  notation: [
    ["q0, q1, …", "states of the NFA"],
    ["D0, D1, …", "states of the DFA; each stands for a set of NFA states"],
    ["M0, M1, …", "states of the minimal DFA; each stands for a group of D states"],
    ["i, f", "start and accept state of the fragment being built"],
    ["blank cell", "no transition"],
    ["stuck", "a run with no transition on the next symbol; it rejects. Not the error state"],
    ["∅", "empty set of NFA states in a cell; in the pair table, the error state that completes the DFA (the minimal DFA drawn has none)"],
    ["✗  ≡", "in the pair table: states told apart by a string / equivalent states"],
  ],
  legend: [
    ["blue", "start state, or the state the simulation is in"],
    ["green", "accepting state"],
    ["red", "the string was rejected"],
  ],
};
