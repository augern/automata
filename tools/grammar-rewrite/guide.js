// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Grammar transformations",
  intro: "Applies a standard transformation to a context-free grammar, one step at a time. Cleanup, ε-elimination, unit elimination and Chomsky normal form each build on the previous ones. Left-recursion elimination prepares a grammar for top-down parsing; Greibach normal form builds on both.",
  use: [
    "The grammar is a table with one production per row, numbered as in the tables (the numbers are shown from the panel menu). Click a symbol to edit it; type symbols into the field at the end of a row (Space or Enter makes each one a chip). A `|` starts another production for the same left side, and so does Enter in an empty field. Where a left side repeats, the row shows the `|` it was written with; pointing at the row shows the left side, faded: a production of its own to the parser. Backspace in an empty field removes the last symbol, and then the row. The last row is always an empty entry for a new production: type symbols in it, or a new left side first (left empty, it is the left side above). The first left side is the start symbol. The ⋯ menu of a row disables or enables it (a disabled production is written as a comment), duplicates, moves or deletes it. A production with no symbols derives the empty string (shown as ε); `eps` and ε typed in an empty row mean the same. A symbol in quotes is a terminal written literally, such as `'|'` or `'('` (a doubled quote inside quotes is the quote itself: `''''` is `'`); names such as `E'` are allowed. The panel menu switches to the text view of the same grammar, which can be pasted into and copied from."
    "Select the transformation in the top bar and press Step. The middle panel explains each step; Current Grammar shows the result so far.",
    "The language is preserved (except for ε where noted); only the form changes.",
  ],
  notation: [
    ["productive", "a nonterminal that can derive some string of terminals"],
    ["reachable", "a symbol that can appear in a derivation from the start symbol"],
    ["nullable", "a nonterminal that can derive ε"],
    ["unit production", "a rule A → B with a single nonterminal on the right"],
    ["Chomsky normal form", "every rule is A → B C or A → a"],
    ["Greibach normal form", "every rule is A → a B₁ … Bₖ: a terminal, then nonterminals only (S → ε is kept if the language has ε)"],
  ],
  legend: [],
};
