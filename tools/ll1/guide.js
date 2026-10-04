// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "LL(1) parser",
  intro: "Enter a context-free grammar and see how a predictive, top-down parser with one symbol of lookahead would handle it: the FIRST and FOLLOW sets, the parsing table, and a step-by-step parse of a string with its parse tree.",
  use: [
    "Write one rule per line, `A -> α | β`, with symbols separated by spaces. `eps` is the empty string; names such as `E'` are allowed.",
    "Build the tables step by step with Table Step ›, or just read them. If a table cell holds two productions the grammar is not LL(1), and the conflicts are listed under the table.",
    "Parse a string in the simulation panel (the dice makes a random sentence). Each step expands the nonterminal on top of the stack, or matches a terminal with the next input symbol.",
    "A grammar with left recursion is never LL(1); the Grammar Transformations tool can remove it.",
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
