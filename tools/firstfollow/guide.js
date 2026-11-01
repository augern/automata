// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "FIRST & FOLLOW",
  intro: "Shows the nullable symbols and the FIRST and FOLLOW sets of a context-free grammar, and why each member is in its set: a derivation drawn as nested triangles over a sentence of the language.",
  use: [
    "The grammar is edited as in the other grammar tools. The first left side is the start symbol.",
    "Sets: one row per nonterminal. Click a member (a token, a ✓ or the ε of FIRST) to see its witness.",
    "Witness: the path of a derivation as nested triangles, one nonterminal per triangle, joined by the spine. Beside each step stand the strings that the other symbols of the rule derive, on the left and on the right; ε where a symbol vanishes, with the symbols named under the string. The base line reads as a sentence of the language, and the derivation is written under the figure.",
    "FIRST(A) ∋ t: the arrow runs along the base line from the left foot of A to the first token that is not ε, which is t. FOLLOW(B) ∋ t: the arrow runs from the right foot of B to the next token that is not ε; its first token, t, is in bold. $ stands after the whole string.",
    "Construction, the collapsed panel on the right, finds the sets one rule at a time: nullable symbols, then FIRST, then FOLLOW, round by round until a round adds nothing. Restart empties the sets; the witness stays.",
    "The box under the sets gives FIRST and nullability of any string of symbols, from the finished sets.",
    "Pointing at a member of a set, or at a row of the construction, marks the production in the grammar.",
  ],
  notation: [
    ["nullable", "a symbol that can derive the empty string; its triangle has only ε under it"],
    ["FIRST(A)", "the terminals a string derived from A can start with; ε would belong to it when A is nullable"],
    ["FOLLOW(A)", "the terminals that can come right after A in a sentential form; $ follows the start symbol"],
    ["FIRST of a sequence", "FIRST of each symbol up to and including the first one that is not nullable"],
    ["fixpoint", "the state in which applying every rule once more changes nothing"],
  ],
  legend: [
    ["orange", "the symbol the witness is about; the member selected in the sets"],
    ["blue", "FIRST: the token seen first, and the arrow to it"],
    ["green", "FOLLOW: the token that comes next, and the arrow to it"],
    ["grey", "the triangles of the path, deeper with each step down"],
  ],
};
