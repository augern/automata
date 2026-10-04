// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "LR parser",
  intro: "Enter a grammar and build a bottom-up (shift–reduce) parser for it. The buttons at the top choose how much lookahead the parser uses to decide reductions: none for LR(0), FOLLOW sets for SLR(1), full lookahead for LR(1), and LALR(1) is a compact approximation of LR(1). The automaton, the ACTION and GOTO tables and a parse of a string are shown.",
  use: [
    "Write one rule per line, `A -> α | β`, with symbols separated by spaces. `eps` is the empty string.",
    "Step through building the automaton and then the tables. The Coarse / Fine switch sets how much happens in each construction step.",
    "A table cell with two actions is a conflict (red): the grammar does not work with the chosen method. Try a stronger method and see whether the conflict goes away.",
    "Parse a string in the simulation panel (the dice makes a random sentence).",
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
