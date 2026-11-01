// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "FIRST & FOLLOW",
  intro: "Builds the nullable symbols and the FIRST and FOLLOW sets of a context-free grammar by fixpoint iteration: every rule is applied again and again until a whole round adds nothing.",
  use: [
    "The grammar is edited as in the other grammar tools. The first left side is the start symbol.",
    "Step › applies one rule; Round ›› finishes the current round; the arrow button runs to the end. The phase buttons jump to the end of a phase. Clicking a row in the log jumps to that step.",
    "The three phases run in order: nullable symbols, FIRST, FOLLOW. Each needs the previous one.",
    "The right-hand side is read from the left. A dashed cell can derive ε, so the scan goes on; a solid blue cell cannot, so the scan stops and the cells after it stay faded. A scan that passes every cell reaches the end.",
    "Pointing at a member of a set, or at a log row, marks the production in the grammar.",
    "The box under the sets gives FIRST and nullability of any string of symbols, from the finished sets.",
  ],
  notation: [
    ["nullable", "a symbol that can derive the empty string"],
    ["FIRST(A)", "the terminals a string derived from A can start with; ε would belong to it when A is nullable"],
    ["FOLLOW(A)", "the terminals that can come right after A in a sentential form; $ follows the start symbol"],
    ["FIRST of a sequence", "FIRST of each symbol up to and including the first one that is not nullable"],
    ["fixpoint", "the state in which applying every rule once more changes nothing"],
  ],
  legend: [
    ["blue", "a cell the scan stops at; a new set member"],
    ["green", "a cell that can derive ε; the end of a scan; FOLLOW sets"],
    ["orange", "the occurrence that receives tokens in the FOLLOW phase; the same production in another panel"],
    ["grey", "a cell not read"],
  ],
};
