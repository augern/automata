// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey, orange.
window.TOOL_GUIDE = {
  title: "Pumping",
  intro: "Shows why the pumping lemmas hold. A long path in a DFA visits some state twice; a tall path in a parse tree repeats some nonterminal. Repeating the loop, or the part between the two nonterminals, gives more strings of the same language.",
  use: [
    "Regular: define a DFA as text (`q0 a q1` is a transition; `start:` and `accept:` name states) or convert a regular expression to its minimal DFA. For a string, the path through the DFA is shown; the first state visited twice splits the string into x, y and z.",
    "The slider repeats y i times (0 removes the loop). Stepping follows the DFA through the string. The pumped string ends in the same state, so it is accepted exactly when the original was.",
    "Context-free: enter a grammar and a string it generates. The longest path of its parse tree repeats a nonterminal; the part between the two occurrences (v and y) is repeated or removed. The result is a parse tree of the same grammar. “Another repeat” selects another pair.",
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
