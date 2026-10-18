// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "LL(1) parser",
  intro: "Computes the FIRST and FOLLOW sets and the parsing table of a context-free grammar for a predictive top-down parser with one symbol of lookahead, and traces a parse of a string with its parse tree.",
  use: [
    "Write one rule per line, `A -> α | β`, with symbols separated by spaces. `eps` is the empty string; names such as `E'` are allowed. A symbol in quotes is a terminal written literally, such as `'|'` (a doubled quote inside quotes is the quote itself: `''''` is `'`) or `'('`. Input strings may be written without spaces when the terminals are single characters.",
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
