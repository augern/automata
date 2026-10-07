// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "LR parser",
  intro: "Builds a bottom-up (shift–reduce) parser for a grammar: the automaton, the ACTION and GOTO tables, and a parse of a string. The buttons at the top select the lookahead used for reductions: none (LR(0)), FOLLOW sets (SLR(1)), merged LR(1) lookaheads (LALR(1)) or full LR(1) lookahead.",
  use: [
    "Write one rule per line, `A -> α | β`, with symbols separated by spaces. `eps` is the empty string.",
    "Step through the construction of the automaton, then of the tables. Coarse / Fine sets the size of each step.",
    "A cell with two actions is a conflict (red): the grammar is outside the chosen class. A stronger method may remove it.",
    "Simulation panel: enter a string (the dice gives a random sentence).",
  ],
  notation: [
    ["I0, I1, …", "states of the automaton; each is a set of items"],
    ["A → α • β", "an item: the dot marks how much of the rule has been recognised"],
    ["sN", "shift: read the symbol and go to state N"],
    ["rN", "reduce by production N"],
    ["acc", "accept"],
    ["GOTO", "the state to go to after a reduction produced a nonterminal"],
    ["s5/r1", "two actions in one cell: a conflict"],
  ],
  legend: [
    ["blue", "the current state or table entry"],
    ["red", "a conflict"],
  ],
};
