// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Recursive descent",
  intro: "Generates recursive-descent procedures from a grammar and runs them, predictively or with backtracking.",
  grammarEditor: true,
  use: [
    "Each production is one alternative of the generated procedure; alternatives are tried in the written order. The input may be written without spaces.",
    "Enter a string (dice: random) and step through the run. The highlighted line is the current action; dimmer lines are calls waiting for an answer.",
    "The grammar marks the production being tried and the symbol matched or called: matched symbols are green, abandoned alternatives grey. Hovering a code line or tree node marks its production.",
    "The tree shows every call and alternative tried; abandoned ones are greyed, and the checkbox hides them. Click a node to explain it.",
    "The curve under the input is the read position over time; each drop is a backtrack. Click or drag it to move through the run.",
    "Predictive: the next token chooses the alternative (FIRST, or FOLLOW for an empty alternative; the procedure lists them). A token that predicts nothing, or a terminal that does not match, is a syntax error. If one token predicts two alternatives the grammar is not LL(1): the first is taken (a note says where), and a string of the language may be rejected.",
    "Complete search finds a parse whenever one exists. Ordered choice commits to the first matching alternative and can reject strings of the language. Packrat is ordered choice with a memo table; ↺ marks an answer from it.",
    "A left-recursive nonterminal calls itself without reading: the run stops at the first repeat. Grammar Transformations removes left recursion.",
  ],
  notation: [
    ["A @ i", "a call of A at position i, after i tokens"],
    ["1, 2 on a branch", "the alternative the branch starts; hover for the production"],
    ["backtrack", "a match taken back, or an alternative given up for the next"],
    ["depth", "calls waiting for an answer; the longest chain so far"],
  ],
  legend: [
    ["blue", "in progress"],
    ["green", "matched, at least for now"],
    ["red", "failed here"],
    ["grey", "abandoned: backtracking undid it"],
  ],
};
