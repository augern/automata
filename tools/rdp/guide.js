// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Backtracking recursive descent",
  intro: "A recursive-descent parser has one procedure per nonterminal and tries a nonterminal's alternatives in the order written. When a guess turns out wrong it backtracks: it undoes what the guess read and tries the next alternative. This tool shows the procedures generated from a grammar and how the search for a parse unfolds.",
  use: [
    "Write one rule per line, `A -> α | β`, symbols separated by spaces. The order of the alternatives is the order they are tried in. `eps` is the empty string.",
    "Enter a string (the dice makes a random one) and step through the run. The highlighted line of a procedure is what the parser is doing; the dimmer lines are the calls it is waiting for.",
    "The tree shows every call and every alternative tried. Abandoned attempts stay in the tree, greyed out, so you can see the dead ends; untick the box to see only what is left. Click a node for an explanation.",
    "The curve under the input shows the read position over time. Every drop is a backtrack. Click or drag along it to move through the run.",
    "Complete search yields every position where a nonterminal can end and returns into it when the rest fails, so it finds a parse whenever there is one. Ordered choice commits to the first alternative that matches and never revisits it: faster, but it can reject strings that are in the language.",
    "A left-recursive nonterminal calls itself without reading anything. The run stops at the first repeat; the Grammar Transformations tool can remove the recursion.",
  ],
  notation: [
    ["A @ i", "a call of A at position i, that is, after i tokens have been read"],
    ["①②", "a numbered alternative of a nonterminal with more than one rule"],
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
