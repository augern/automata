// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "LR parser",
  intro: "Builds a shift–reduce parser: the automaton, the ACTION and GOTO tables and a parse of a string. The buttons choose the lookahead: LR(0), SLR(1), LALR(1) or LR(1).",
  grammarEditor: true,
  use: [
    "Pointing at a production (grammar, automaton item, ACTION reduction, parse tree) marks it in the other views. Reductions carry the production number (r3); production 0 is the added start production.",
    "Step through the automaton, then the tables; Coarse / Fine sets the step size.",
    "A cell with two actions is a conflict (red): the grammar is outside the chosen class.",
    "Above 40 states the automaton shows state numbers only; the panel menu (⋯) can force either view.",
    "Simulation: enter a string (dice: random sentence). Without spaces, single-character terminals are read one by one.",
  ],
  notation: [
    ["I0, I1, …", "states of the automaton, each a set of items"],
    ["sN, rN, acc", "shift to state N, reduce by production N, accept"],
    ["s5/r1", "two actions in one cell: a conflict"],
    ["number on a tree node", "the shift (blue) or reduce (purple) that made the node, counted from 1; a GOTO belongs to its reduce"],
  ],
  legend: [
    ["blue", "the current state or table entry"],
    ["red", "a conflict"],
  ],
};
