// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "FIRST & FOLLOW",
  intro: "Nullable symbols, FIRST and FOLLOW sets of a context-free grammar, each member with a witness: a derivation drawn as nested triangles.",
  use: [
    "Results: click a member to show its witness.",
    "Construction: Step, Round and the phase buttons build the sets; a row of the log shows its step in the witness. Skip idle steps leaves out the steps that add nothing.",
    "Witness: ‹ › steps through the other derivations of a member, or through the members a step adds. Nullable, FIRST and FOLLOW show the general case. Shorten strings replaces example strings by a faded …",
    "The box under the sets gives FIRST of any string of symbols.",
  ],
  notation: [
    ["x ∈ S, {x, y} ⊆ S", "in the log: one member or several added to the set S"],
    ["…", "in a figure, a faded string: whatever the symbol below it derives; hover for an example"],
    ["jagged edge", "in a figure, a derivation of any number of steps with its nodes left out"],
    ["$", "the end marker"],
  ],
  legend: [
    ["orange", "the symbol the witness is about; the selected member"],
    ["blue", "FIRST: the first token that is not ε"],
    ["green", "FOLLOW: the token that comes next"],
    ["grey", "the triangles of the path"],
  ],
};
