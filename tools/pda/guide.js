// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "PDA simulator",
  intro: "Defines a pushdown automaton and traces its reading of a string; the Configuration Tree shows every computation.",
  use: [
    "Each row is a transition: in state `from`, reading `input`, with `pop` on top of the stack, go to `to` and push `push`.",
    "A blank `input` is an ε-move; a blank `pop` or `push` pops or pushes nothing. A pushed string is written top first.",
    "Acceptance is by final state or by empty stack, after all input is read.",
    "Step through a string. Click a tree node to explain its configuration.",
  ],
  notation: [
    ["(q, w, γ)", "state, unread input, stack (top first)"],
    ["a, A/BC", "on an edge: read a, pop A, push BC"],
    ["⊥", "the initial stack symbol"],
    ["A ⊥ ↑", "a stack, top first; ↑ marks its bottom end, … hidden symbols"],
  ],
  legend: [
    ["blue", "start state; the configurations now"],
    ["green", "accepted"],
    ["red", "rejected: input ran out without acceptance"],
    ["grey", "dead end: no rule applied"],
  ],
};
