// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Recursive descent",
  intro: "A recursive-descent parser has one procedure per nonterminal. A predictive parser looks at the next token and picks the one alternative it predicts (LL(1)); it never goes back. A backtracking parser tries the alternatives in the written order and undoes a wrong guess. The tool shows the procedures generated from a grammar and the run, with its tree.",
  use: [
    "The grammar is a table with one production per row, one alternative of the generated procedure each (the numbers are shown from the panel menu). Click a symbol to edit it; type symbols into the field at the end of a row (Space or Enter makes each one a chip). A `|` starts another production for the same left side, and so does Enter in an empty field. Where a left side repeats, the row shows the `|` it was written with; pointing at the row shows the left side, faded: a production of its own to the parser. Backspace in an empty field removes the last symbol, and then the row. The last row is always an empty entry for a new production: type symbols in it, or a new left side first (left empty, it is the left side above). The first left side is the start symbol. The ⋯ menu of a row disables or enables it (a disabled production is written as a comment), duplicates, moves or deletes it. A production with no symbols derives the empty string (shown as ε); `eps` and ε typed in an empty row mean the same. A symbol in quotes is a terminal written literally, such as `'|'` or `'('` (a doubled quote inside quotes is the quote itself: `''''` is `'`); names such as `E'` are allowed. The panel menu switches to the text view of the same grammar, which can be pasted into and copied from. Alternatives are tried in the written order. Input strings may be written without spaces.",
    "Enter a string (the dice gives a random one) and step through the run. The highlighted line is the current action; dimmer lines are the calls waiting for an answer.",
    "The grammar marks the current step: the left and right side of the production being tried, and the symbol being matched or called. Matched symbols of the current alternative are green; abandoned alternatives are grey, in the grammar and in the code. Hovering a code line or a tree node marks its production.",
    "The tree shows every call and every alternative tried. Abandoned attempts stay in the tree, greyed; the checkbox hides them. Click a node to explain it.",
    "The curve under the input is the read position over time; each drop is a backtrack. Click or drag on it to move through the run.",
    "Predictive (no backtracking): each procedure picks its alternative by the next token, the FIRST set of the alternative or, for an empty one, the FOLLOW set of the nonterminal; the procedure lists them. A token that predicts nothing, or a terminal that does not match, is a syntax error, and the run ends there. If one token predicts two alternatives the grammar is not LL(1): the parser commits to the first (a note under the grammar says where), and may reject a string of the language. Left recursion is still caught.",
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
