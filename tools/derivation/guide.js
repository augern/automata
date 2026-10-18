// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Grammar derivations",
  intro: "Builds a derivation: starting from the start symbol, part of the current form is rewritten repeatedly. Handles context-free, context-sensitive and unrestricted grammars (productions with several symbols on the left).",
  use: [
    "One rule per line, `A -> α | β`; `eps` is the empty string; a symbol in quotes is a terminal written literally, such as `'|'` (a doubled quote inside quotes is the quote itself: `''''` is `'`).",
    "Select part of the last line (click a symbol or drag across several), then click a production in the Productions panel whose left side matches.",
    "Esc clears the selection; `z` undoes the last step.",
    "Random choice applies a random production at a random place; ▶| continues until the derivation ends. Reseed restarts with a new random sequence; the same seed gives the same derivation.",
  ],
  notation: [
    ["⇒", "one derivation step; the number before it is the production used (hover it for the rule)"],
    ["underlined", "the part that was rewritten in that step"],
    ["✓ derived", "only terminals remain: a word of the language"],
    ["dead end", "no production applies but nonterminals remain (possible in context-sensitive grammars); go back and choose differently"],
  ],
  legend: [
    ["blue", "nonterminal symbols"],
    ["grey", "terminal symbols"],
  ],
};
