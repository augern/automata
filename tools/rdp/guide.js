// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Backtracking recursive descent",
  intro: "A recursive-descent parser has one procedure per nonterminal and tries its alternatives in the written order. A wrong guess is undone (backtracking) and the next alternative is tried. The tool shows the procedures generated from a grammar and the search for a parse.",
  use: [
    "Enter one production per line, `A -> α | β`, symbols separated by spaces. Alternatives are tried in the written order. `eps` is the empty string. A symbol in quotes is a terminal written literally, such as `'|'` (a doubled quote inside quotes is the quote itself: `''''` is `'`) or `'('`. Input strings may be written without spaces.",
    "Enter a string (the dice gives a random one) and step through the run. The highlighted line is the current action; dimmer lines are the calls waiting for an answer.",
    "The grammar text marks the current step: the left and right side of the production being tried, and the symbol being matched or called. Matched symbols of the current alternative are green; abandoned alternatives are grey, in the grammar and in the code. Hovering a code line or a tree node marks its production.",
    "The tree shows every call and every alternative tried. Abandoned attempts stay in the tree, greyed; the checkbox hides them. Click a node to explain it.",
    "The curve under the input is the read position over time; each drop is a backtrack. Click or drag on it to move through the run.",
    "Complete search yields every position where a nonterminal can end and returns into it when the rest fails, so it finds a parse whenever one exists. Ordered choice commits to the first alternative that matches and never revisits it: faster, but it can reject strings of the language.",
    "Packrat is ordered choice with a memo table: a repeated call of a nonterminal at the same position is answered from the table (marked ↺). Verdicts equal those of ordered choice; the repeated work is avoided.",
    "A left-recursive nonterminal calls itself without reading anything; the run stops at the first repeat. Grammar Transformations removes left recursion.",
  ],
  notation: [
    ["A @ i", "a call of A at position i, that is, after i tokens have been read"],
    ["1, 2 on a branch", "the alternative the branch starts; hover for the production"],
    ["backtrack", "a rejected match that is taken back, or an alternative given up for the next one"],
    ["depth", "how many calls are waiting for an answer; the longest chain so far"],
  ],
  legend: [
    ["blue", "in progress: a call or alternative that is being tried"],
    ["green", "matched, at least for now"],
    ["red", "failed right here"],
    ["grey", "abandoned: backtracking undid it"],
  ],
};
