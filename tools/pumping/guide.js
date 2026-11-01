// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Pumping",
  intro: "Shows why the pumping lemmas hold: a path in a DFA or a parse tree repeats a state or a nonterminal, and the loop can be repeated or removed.",
  use: [
    "Regular: define a DFA as text (`q0 a q1` is a transition; `start:` and `accept:` name states) or convert a regular expression. For a string, the first state visited twice splits it into x, y and z.",
    "The slider repeats y (regular) or v and y (context-free) i times; 0 removes the loop. Stepping follows the DFA through the string.",
    "Context-free: enter a grammar and a string it generates. “Another repeat” selects another repeating pair.",
    "Without a string the figure is the general case. Path draws the repeated nonterminals as nested triangles; Tree draws the parse tree. Unify baselines puts the string on one base line. The figure pans and zooms; double-click fits it.",
  ],
  notation: [
    ["p", "the pumping length used here: the number of DFA states; for a grammar b^(|V|+1), b the longest right-hand side (at least 2), |V| the number of nonterminals. Shorter strings may be pumpable too"],
    ["i", "repetitions; i = 1 is the original string"],
  ],
  legend: [
    ["blue", "x: before the loop (regular); inside the lower repeated nonterminal (context-free)"],
    ["orange", "y, the loop; v and y in trees"],
    ["green", "z: after the loop"],
    ["grey", "u: before the repeated nonterminal (trees)"],
  ],
};
