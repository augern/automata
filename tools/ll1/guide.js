// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "LL(1) parser",
  intro: "Computes FIRST and FOLLOW, the predictive parsing table and a parse of a string with its tree.",
  grammarEditor: true,
  use: [
    "Table Step › builds the entries one at a time. A cell with two productions is a conflict, listed under the table.",
    "Simulation: enter a string (dice: random sentence). Each step expands the top nonterminal or matches a terminal.",
    "Pointing at a set member says why it is there; at a tree node, marks its derivation steps; at a production number, marks it in the tables.",
    "The input is split at spaces, otherwise cut at the longest known terminals. `$` is the end marker and cannot be a terminal.",
    "On a conflict the parser uses the first production and says so in the log. A reachable left-recursive nonterminal makes the grammar non-LL(1); Grammar Transformations removes it.",
  ],
  notation: [
    ["sentential form", "in the derivation panel: the input read (grey), then the stack, top at the left"],
    ["(n)", "after an action: the number of the production used"],
  ],
  legend: [
    ["blue", "the symbol or table cell in use"],
    ["green", "a terminal on the stack, waiting to be matched"],
    ["grey", "$, the bottom of the stack"],
    ["orange", "the same item in another panel, under the pointer"],
    ["red", "a conflict; an error"],
  ],
};
