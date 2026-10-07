// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Grammar transformations",
  intro: "Applies a standard transformation to a context-free grammar, one step at a time. Cleanup, ε-elimination, unit elimination and Chomsky normal form each build on the previous ones. Left-recursion elimination prepares a grammar for top-down parsing; Greibach normal form builds on both.",
  use: [
    "Enter a grammar, one rule per line, `A -> α | β`; `eps` is the empty string.",
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
