// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "PDA simulator",
  intro: "Define a pushdown automaton, an NFA with a stack, and trace how it reads a string. As with an NFA there may be several computations at once; the Configuration Tree shows all of them.",
  use: [
    "Each row of the rules table is a transition: in state `from`, reading `input`, with `pop` on top of the stack, go to state `to` and push `push`.",
    "Leave `input` blank for an ε-move. Leave `pop` or `push` blank to pop or push nothing. A pushed string is written top first: its leftmost symbol ends up on top.",
    "Choose whether a string is accepted by final state, or by empty stack once the input is used up.",
    "Step through a string. Click a node of the tree to see what that configuration is and how it arose.",
  ],
  notation: [
    ["(q, w, γ)", "a configuration: the current state, the input still unread, and the stack (top first)"],
    ["a, A/BC", "on an edge: read a, pop A, push BC (ε when nothing)"],
    ["⊥", "the initial stack symbol"],
    ["A ⊥ ↑", "a stack listed top first; ↑ marks its bottom end, … means more symbols are hidden"],
  ],
  legend: [
    ["blue", "start state; the configurations the PDA is in now"],
    ["green", "accepted"],
    ["red", "rejected: the input ran out without acceptance"],
    ["grey", "dead end: no rule applied"],
  ],
};
