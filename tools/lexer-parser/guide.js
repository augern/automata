// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey, orange.
window.TOOL_GUIDE = {
  title: "Scanner and parser",
  intro: "Shows how a scanner and a parser cooperate. The parser asks the scanner for the next token only when it needs one; the scanner bites off the next lexeme of the input, skipping white space, and returns a token. The run is shown one event at a time.",
  use: [
    "Token rules, one per line: `name  pattern`. The name is the terminal the grammar uses (quoted when it has special characters, as `'+'`). Patterns are regular expressions as in the Regular Expression tool, with character classes such as `[0-9]`. `-> skip` marks rules whose lexemes are discarded. The longest match wins; on a tie the earlier rule does.",
    "The grammar is written as in the other grammar tools. A terminal needs a token rule of the same name.",
    "Step through the run. The Input row shows the scanner at work: the lexeme it bites off, and the characters it looked at beyond it and gave back. The parser is a table-driven SLR(1) parser; when its next action is a reduction whatever the next token is, it reduces first and fetches no token.",
    "A lexical error is a position where no token rule matches; a syntax error is a token the parser cannot use in its current state.",
  ],
  notation: [
    ["lexeme", "the characters of the input that make up one token"],
    ["token", "a name (the terminal) with the lexeme it stands for"],
    ["look-ahead", "the token the parser has been given but not yet shifted"],
    ["stack", "states of the parser with the symbols that led to them"],
  ],
  legend: [
    ["blue", "the lexeme the scanner just bit off"],
    ["orange", "characters the scanner looked at beyond the lexeme, and gave back; the look-ahead token"],
    ["green", "the input was accepted"],
    ["red", "a lexical or syntax error"],
  ],
};
