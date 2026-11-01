// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Grammar derivations",
  intro: "Builds a derivation step by step in a context-free, context-sensitive or unrestricted grammar.",
  grammarEditor: true,
  use: [
    "A left side of several symbols makes a production context-sensitive.",
    "Select part of the last line (click a symbol or drag), then click a production whose left side matches. Esc clears the selection; `z` undoes the last step.",
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
