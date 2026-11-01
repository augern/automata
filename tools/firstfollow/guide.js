// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "FIRST & FOLLOW",
  intro: "Shows the nullable symbols and the FIRST and FOLLOW sets of a context-free grammar, and why each member is in its set: a derivation drawn as nested triangles over a sentence of the language.",
  use: [
    "The grammar is edited as in the other grammar tools. The first left side is the start symbol.",
    "Results: the sets, one row per nonterminal. Click a member (a token, a ✓ or the ε of FIRST) to see its witness.",
    "Witness: the path of a derivation as nested triangles, one nonterminal per triangle, joined by the spine. Beside each step stand the strings that the other symbols of the rule derive, on the left and on the right, one column for each symbol, ε where a symbol vanishes, with the symbol named under it. The base line reads as a sentence of the language, and the derivation is written under the figure.",
    "General case: the buttons Nullable, FIRST and FOLLOW above the figure show what each means for any grammar, with symbols in place of a grammar. A step of the construction that adds nothing shows the general case of its phase.",
    "Several ways: a member often has more than one derivation. When it does, the arrows above the figure step through them, the shortest first. Whole set steps through the shortest witness of every member of the selected set; so does a step that adds several members.",
    "Strings: what the member depends on is spelled out (its token, ε, terminals of the rule). A string that only stands for what a symbol derives is a faded …, named below; hover for an example. Show sample strings spells such strings out.",
    "FIRST(A) ∋ t: the arrow runs along the base line from the left foot of A to the first token that is not ε, which is t. FOLLOW(B) ∋ t: the arrow runs from the right foot of B to the next token that is not ε; its first token, t, is in bold. $ stands after the whole string.",
    "Construction finds the sets one rule at a time: nullable symbols, then FIRST, then FOLLOW, round by round until a round adds nothing. Each step that adds a member shows that member's witness. Clicking a row of the log shows that step in the witness pane without moving the construction; Restart empties the results. Skip idle steps leaves out the steps that add nothing, in the stepping (Step, Back, Round, the phase buttons) and in the log, where each phase that has reached its fixpoint gets one line; the choice is remembered.",
    "The box under the sets gives FIRST and nullability of any string of symbols, from the finished sets.",
    "The definitions behind the sets (nullable, FIRST, FOLLOW, derivations) are under Definitions in the top bar.",
    "Pointing at a member of a set, or at a row of the construction, marks the production in the grammar.",
  ],
  notation: [
    ["x ∈ S, {x, y} ⊆ S", "in the construction log: one member or several added to the set S by a step"],
    ["…", "in a figure, a faded string that only stands for what the symbol below it derives; hover for an example"],
    ["jagged edge", "in a figure, a derivation of any number of steps whose nodes are left out"],
    ["$", "the end marker: it follows the start symbol, and is shown where a witness ends the sentence"],
  ],
  legend: [
    ["orange", "the symbol the witness is about; the member selected in the sets"],
    ["blue", "FIRST: the token seen first, and the arrow to it"],
    ["green", "FOLLOW: the token that comes next, and the arrow to it"],
    ["grey", "the triangles of the path, deeper with each step down"],
  ],
};
