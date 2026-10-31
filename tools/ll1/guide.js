// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "LL(1) parser",
  intro: "Computes the FIRST and FOLLOW sets and the parsing table of a context-free grammar for a predictive top-down parser with one symbol of lookahead, and traces a parse of a string with its parse tree.",
  use: [
    "The grammar is a table with one production per row, numbered as in the tables (the numbers are shown from the panel menu). Click a symbol to edit it; type symbols into the field at the end of a row (Space or Enter makes each one a chip). A `|` starts another production for the same left side, and so does Enter in an empty field. Where a left side repeats, the row shows the `|` it was written with; pointing at the row shows the left side, faded: a production of its own to the parser. Backspace in an empty field removes the last symbol, and then the row. The last row is always an empty entry for a new production: type symbols in it, or a new left side first (left empty, it is the left side above). The first left side is the start symbol. The ⋯ menu of a row disables or enables it (a disabled production is written as a comment), duplicates, moves or deletes it. A production with no symbols derives the empty string (shown as ε); `eps` and ε typed in an empty row mean the same. A symbol in quotes is a terminal written literally, such as `'|'` or `'('` (a doubled quote inside quotes is the quote itself: `''''` is `'`); names such as `E'` are allowed. The panel menu switches to the text view of the same grammar, which can be pasted into and copied from.",
    "Table Step › builds the tables one entry at a time. A cell with two productions is a conflict: the grammar is not LL(1). Conflicts are listed under the table.",
    "Simulation panel: enter a string (the dice gives a random sentence). Each step expands the nonterminal on top of the stack or matches a terminal with the next input symbol.",
    "Pointing at a member of a FIRST or FOLLOW set says why it is there. The LL(1) check lists, for every nonterminal with several alternatives, where the condition fails.",
    "Pointing at a node of the parse tree marks the derivation steps that create and expand it, and the other way round. Pointing at a production number marks it in the tables.",
    "The input string is split at spaces; without spaces it is cut at the longest known terminals. `$` is the end marker and cannot be an input symbol or a terminal of the grammar.",
    "On a conflicting table entry the parser uses the first production and says so in the log. A grammar with a left-recursive nonterminal that can be reached from the start symbol is never LL(1); Grammar Transformations removes left recursion.",
  ],
  notation: [
    ["FIRST(A)", "the terminals a string derived from A can start with, and ε if A can derive the empty string (A is nullable)"],
    ["FOLLOW(A)", "the terminals that can come right after A"],
    ["M[A, a]", "the table entry for nonterminal A and next input symbol a: which production to use"],
    ["LL(1) condition", "for A → α | β: FIRST(α) ∩ FIRST(β) = ∅, and if β derives ε, FIRST(α) ∩ FOLLOW(A) = ∅"],
    ["sentential form", "in the derivation panel: the input read so far (grey), then the stack with its top at the left"],
    ["$", "the end of the input"],
    ["(n)", "after an action: the number of the production used, as in the numbered list"],
  ],
  legend: [
    ["blue", "the symbol or table cell in use right now"],
    ["green", "a terminal on the stack, waiting to be matched"],
    ["grey", "$, the bottom of the stack"],
    ["orange", "the same thing in another panel, under the pointer: a tree node and its derivation steps, a production"],
    ["red", "a conflict; an error"],
  ],
};
