// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Grammar transformations",
  intro: "Applies a classic transformation to a context-free grammar, one step at a time. Cleanup, ε-elimination, unit elimination and Chomsky normal form go from mild to strict, each building on the ones before; left-recursion elimination prepares a grammar for top-down parsing such as LL(1).",
  use: [
    "Type or pick a grammar on the left, one rule per line, `A -> α | β`; `eps` is the empty string.",
    "Choose the transformation in the top bar, then press Step. The middle panel explains each step; Current Grammar shows the result so far.",
    "Compare the original grammar with the result: the language stays the same (apart from ε where noted), only the form changes.",
  ],
  notation: [
    ["productive", "a nonterminal that can derive some string of terminals"],
    ["reachable", "a symbol that can appear in a derivation from the start symbol"],
    ["nullable", "a nonterminal that can derive ε"],
    ["unit production", "a rule A → B with a single nonterminal on the right"],
    ["Chomsky normal form", "every rule is A → B C or A → a"],
  ],
  legend: [],
};
