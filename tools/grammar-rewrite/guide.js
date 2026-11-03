// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Grammar transformations",
  intro: "Applies a standard transformation to a context-free grammar, one step at a time.",
  grammarEditor: true,
  use: [
    "Select a transformation with the button in the top bar and press Step. The middle panel explains each step; Current Grammar shows the result.",
    "Cleanup, ε-elimination, unit elimination and Chomsky normal form build on each other; Greibach normal form builds on left-recursion elimination and these.",
    "The language is preserved, except for ε where noted.",
  ],
  notation: [
  ],
  legend: [
  ],
};
