// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey, orange.
window.TOOL_GUIDE = {
  title: "Scanner",
  intro: "Shows how a scanner is built from token rules: one NFA for all the rules, the characters cut into classes, the minimal DFA over those classes, and the scanner running on an input, one character at a time. A scanner follows the maximal munch (longest match) rule: it returns the longest lexeme any rule matches; of two rules that match the same lexeme, the earlier wins.",
  use: [
    "Each row of the token rules is `name  pattern`; the order is the priority. A rule that discards what it matches (white space, a comment) is marked `→ skip`, from its menu (⋯); only that flag matters, the rule's name is free (the examples call the white-space rule `ws`). The entry row at the end makes a new rule. The panel menu switches to the text view of the same rules.",
    "A pattern uses `|`, `*`, `+`, `?`, `( )`, classes such as `[a-z0-9_]` and `[^\"]`, `.` for any character but a newline, `\\n`, `\\t`, and `\\c` for a special character c.",
    "The NFA joins the rules under one start state; each accepting state is tagged with its rule. A rule that can never win, and states where two rules match the same lexeme, are noted under the rules.",
    "Characters that behave alike in every state are one class: the NFA and the DFA have one edge for [a-z], not 26. Characters that no rule mentions are the class “other”. On the DFA a short label is on its edge; a longer one is left out (⋯). Pointing at an edge shows its classes in a tooltip, and pointing at a state shows what it accepts and where it leads. The panel menus (⋯) can show the list of character classes and the transition table. The log names the class of each character read. Pointing at a class marks its edges; pointing at a rule marks the states that accept it.",
    "A real scanner is too big to read as one picture. Above 40 NFA states the NFA shows one rule, the one pointed at in the token rules; above 30 DFA states the DFA shows the part around the current state (the path so far, the last accepting state, where the next character leads). The transition table has every state. The panel menus (⋯) choose the whole automaton instead.",
    "Step through an input. Coarse steps go one token at a time; Fine steps one character at a time, with the DFA in the state the scanner is in. When there is no transition, the scanner backs up to the last accepting state it saw (green) and returns that token.",
  ],
  notation: [
    ["q", "a state of the NFA or the DFA, by number; an accepting state is tagged with its token"],
    ["[a-z]", "an edge for every character of a class"],
    ["maximal munch", "the scanner takes the longest lexeme any rule matches, reading ahead and backing up to the last accepting state"],
    ["other", "any character no rule mentions"],
    ["ε", "an edge that reads no character"],
    ["→ skip", "the rule discards its lexeme"],
  ],
  legend: [
    ["blue", "the state the scanner is in; the transitions taken in this call"],
    ["green", "the last accepting state seen; an accepting state"],
    ["orange", "the pointer: what it is on, in the other views; characters looked at and given back"],
    ["red", "a lexical error, or a pattern that does not parse"],
  ],
};
