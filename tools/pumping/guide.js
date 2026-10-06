// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey, orange.
window.TOOL_GUIDE = {
  title: "Pumping explorer",
  intro: "Why can long strings of a regular language be pumped, and long strings of a context-free language too? In a DFA a long path must visit some state twice; in a parse tree a tall path must repeat some nonterminal. Going around that loop, or repeating that middle part, gives more strings of the same language. This tool shows the loop, lets you pump it, and uses it to refute machines and grammars that claim languages that cannot be pumped.",
  use: [
    "Regular: describe a DFA in the text (`q0 a q1` is a transition, `start:` and `accept:` name states), or turn a regular expression into its minimal DFA. Enter a string: its path through the machine is shown, and the first state it visits twice splits it into x, y and z.",
    "The slider repeats y i times (0 cuts the loop out). Step through the string to see the machine go around the loop. The pumped string always ends in the same state, so it is accepted exactly when the original was.",
    "Context-free: write a grammar and a string it generates. The tree's longest path repeats a nonterminal; the part between the two occurrences is repeated (v and y) or cut out. The result is a parse tree of the same grammar. “Another repeat” picks another pair.",
    "Refute a claim: a machine or grammar says it recognises, for example, aⁿbⁿ. Pick that language and press Find a refutation. The tool pumps a string of the language to build one that the machine or grammar also accepts but that is not in the language. “Show it” loads the argument into the explorer.",
    "If the language is regular (or the machine is right) pumping can never refute it, and the tool says that nothing was found. That is not a proof of correctness.",
  ],
  notation: [
    ["p", "the pumping length: the number of states of the DFA; for a grammar in Chomsky normal form 2 to the power of the number of nonterminals"],
    ["w = x y z", "regular: |xy| ≤ p and |y| ≥ 1; xyⁱz is accepted exactly when w is"],
    ["w = u v x y z", "context-free: |vxy| ≤ p and |vy| ≥ 1; u vⁱ x yⁱ z is generated whenever w is"],
    ["i", "the number of repetitions; i = 1 is the original string, i = 0 cuts the loop out"],
  ],
  legend: [
    ["blue", "x: the part before the loop (regular), or the part inside the lower repeated nonterminal (context-free)"],
    ["orange", "y, the loop: the part that is repeated; for trees v and y"],
    ["green", "z: the part after the loop"],
    ["grey", "u: the part before the repeated nonterminal (context-free trees)"],
  ],
};
