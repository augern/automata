// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Grammar derivations",
  intro: "Builds a derivation step by step in a context-free, context-sensitive or unrestricted grammar.",
  grammarEditor: true,
  use: [
    "A left side of several symbols makes a production context-sensitive.",
    "Select part of the last line (click a symbol or drag), then click a production whose left side matches: in the grammar panel, where the fitting productions are marked. Esc clears the selection; `z` undoes the last step.",
    "While a symbol is selected the grammar is locked, to choose the production; a click on a faded row cancels the selection. Editing the grammar restarts the derivation, after a confirmation.",
    "The tree shows the derivation as a parse tree. A node is numbered with the step that expanded it and labelled with the production (rN), so derivations in different orders give the same tree with different numbers. It stops at the first step whose production has more than one symbol on its left side.",
    "Random choice applies a random production at a random place; ▶| continues to the end; Reseed restarts the random sequence.",
  ],
  notation: [
    ["⇒", "one step; the number before it is the production used (hover for the rule)"],
    ["underlined", "the part rewritten in that step"],
    ["✓ derived", "only terminals remain"],
    ["dead end", "no production applies but nonterminals remain (context-sensitive grammars)"],
  ],
  legend: [
    ["blue", "nonterminals"],
    ["grey", "terminals"],
  ],
};
