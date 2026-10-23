// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "LL(1) parser",
  intro: "Computes the FIRST and FOLLOW sets and the parsing table of a context-free grammar for a predictive top-down parser with one symbol of lookahead, and traces a parse of a string with its parse tree.",
  use: [
    "The grammar is a table with one production per row, numbered as in the tables. Click a symbol to edit it; type symbols into the field at the end of a row (Space or Enter makes each one a chip). A `|` starts another production for the same left side, and so does Enter in an empty field. Where a left side repeats, the row shows the `|` it was written with; pointing at the row shows the left side, faded: a production of its own to the parser. Backspace in an empty field removes the last symbol, and then the row. The first left side is the start symbol. The ⋯ menu of a row disables or enables it (a disabled production is written as a comment), duplicates, moves or deletes it. A production with no symbols derives the empty string (shown as ε); `eps` and ε typed in an empty row mean the same. a symbol in quotes is a terminal written literally (`'|'`); names such as `E'` are allowed. The panel menu switches to the text view of the same grammar, which can be pasted into and copied from.",
    "Table Step › builds the tables one entry at a time. A cell with two productions is a conflict: the grammar is not LL(1). Conflicts are listed under the table.",
    "Simulation panel: enter a string (the dice gives a random sentence). Each step expands the nonterminal on top of the stack or matches a terminal with the next input symbol.",
    "A left-recursive grammar is never LL(1); Grammar Transformations removes left recursion.",
  ],
  notation: [
    ["FIRST(A)", "the terminals a string derived from A can start with"],
    ["FOLLOW(A)", "the terminals that can come right after A"],
    ["M[A, a]", "the table entry for nonterminal A and next input symbol a: which production to use"],
    ["$", "the end of the input"],
    ["(n)", "after an action: the number of the production used, as in the numbered list"],
  ],
  legend: [
    ["blue", "the symbol or table cell in use right now"],
    ["red", "a conflict"],
  ],
};
