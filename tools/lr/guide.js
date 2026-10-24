// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "LR parser",
  intro: "Builds a bottom-up (shift–reduce) parser for a grammar: the automaton, the ACTION and GOTO tables, and a parse of a string. The buttons at the top select the lookahead used for reductions: none (LR(0)), FOLLOW sets (SLR(1)), merged LR(1) lookaheads (LALR(1)) or full LR(1) lookahead.",
  use: [
    "The grammar is a table with one production per row, numbered as in the tables (the numbers are shown from the panel menu). Click a symbol to edit it; type symbols into the field at the end of a row (Space or Enter makes each one a chip). A `|` starts another production for the same left side, and so does Enter in an empty field. Where a left side repeats, the row shows the `|` it was written with; pointing at the row shows the left side, faded: a production of its own to the parser. Backspace in an empty field removes the last symbol, and then the row. The last row is always an empty entry for a new production: type symbols in it, or a new left side first (left empty, it is the left side above). The first left side is the start symbol. The ⋯ menu of a row disables or enables it (a disabled production is written as a comment), duplicates, moves or deletes it. A production with no symbols derives the empty string (shown as ε); `eps` and ε typed in an empty row mean the same. A symbol in quotes is a terminal written literally, such as `'|'` or `'('` (a doubled quote inside quotes is the quote itself: `''''` is `'`); names such as `E'` are allowed. The panel menu switches to the text view of the same grammar, which can be pasted into and copied from. Input strings may be written without spaces when the terminals are single characters.",
    "Pointing at an item in the automaton marks its production in the grammar; pointing at a production marks its items. The production numbers are those of the reductions (r3) in the ACTION table; production 0 is the added start production.",
    "Step through the construction of the automaton, then of the tables. Coarse / Fine sets the size of each step.",
    "A cell with two actions is a conflict (red): the grammar is outside the chosen class. A stronger method may remove it.",
    "Above 40 states the automaton shows only state numbers (a note says so). The Characteristic Automaton panel menu (⋯) can force item sets or numbers only.",
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
