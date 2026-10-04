// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Grammar derivations",
  intro: "Build a derivation in a grammar: start from the start symbol and repeatedly rewrite part of the current form. Works for context-free grammars and also for context-sensitive and unrestricted ones, whose rules may have several symbols on the left.",
  use: [
    "Click a symbol of the last line, or drag across several, to choose the part to rewrite. Then click a production whose left side matches it in the Productions panel.",
    "Esc clears the selection; `z` undoes the last step.",
    "Random choice applies a random rule at a random place; ▶| keeps going until the derivation ends. Reseed starts again with a new random sequence; the same seed always gives the same derivation.",
  ],
  notation: [
    ["⇒", "one derivation step; the number before it is the production used (hover it for the rule)"],
    ["underlined", "the part that was rewritten in that step"],
    ["✓ derived", "only terminals are left: the derivation produced a word of the language"],
    ["dead end", "no rule applies but nonterminals remain; possible in context-sensitive grammars. Go back and choose differently"],
  ],
  legend: [
    ["blue", "nonterminal symbols"],
    ["grey", "terminal symbols"],
  ],
};
