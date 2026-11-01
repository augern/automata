// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Scanner",
  intro: "Builds a scanner from token rules: one NFA for all rules, character classes, the minimal DFA over them, and a run on an input. It returns the longest lexeme any rule matches (maximal munch); of rules matching the same lexeme, the earlier wins.",
  use: [
    "Each row is `name  pattern`; the order is the priority. `→ skip` (⋯ menu) discards what the rule matches. The panel menu switches to the text view.",
    "Patterns: `|`, `*`, `+`, `?`, `( )`, classes `[a-z0-9_]` and `[^\"]`, `.` (any character but a newline), `\\n`, `\\t`, and `\\c` for a special character c.",
    "A rule that can never win, and states where two rules match the same lexeme, are noted under the rules.",
    "Characters that behave alike are one class; characters no rule mentions are “other”. The panel menus (⋯) show the class list and the transition table. Pointing at a class marks its edges; at a rule, its accepting states and returned tokens; at a token, its rule.",
    "Above 40 NFA states only the rule pointed at is shown; above 30 DFA states only the part around the current state. The panel menus choose the whole automaton.",
    "Coarse steps one token, Fine one character. With no transition the scanner backs up to the last accepting state (green) and returns that token.",
  ],
  notation: [
    ["[a-z]", "an edge for every character of a class"],
    ["other", "any character no rule mentions"],
    ["ε", "an edge that reads no character"],
    ["→ skip", "the rule discards its lexeme"],
  ],
  legend: [
    ["blue", "the state the scanner is in; the transitions of this call"],
    ["green", "the last accepting state seen"],
    ["orange", "the pointer, in the other views; characters looked at and given back"],
    ["red", "a lexical error, or a pattern that does not parse"],
  ],
};
