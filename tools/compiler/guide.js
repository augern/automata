// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey, orange.
window.TOOL_GUIDE = {
  title: "Compiler front end",
  intro: "Shows a scanner, a parser and semantic actions working together on an input. The parser asks the scanner for the next token only when it needs one; the scanner consumes the next lexeme, skipping white space. Actions on grammar rules run when the parser reduces, and compute values, types and three-address code bottom-up as the parse tree is built. The examples go from the scanner alone to types and a symbol table.",
  use: [
    "Token rules, one per line: `name  pattern`. The name is the terminal the grammar uses (quoted when it has special characters, as `'+'`). Patterns are regular expressions as in the Regular Expression tool, with character classes such as `[0-9]`. `-> skip` marks rules whose lexemes are discarded. The longest match wins; on a tie the earlier rule does.",
    "The grammar is written as in the other grammar tools; a terminal needs a token rule of the same name. An action goes in `{{ … }}` after the symbols of an alternative. A grammar without actions only parses.",
    "Step through the run. The Input row shows the scanner at work: the lexeme it consumes (blue), the characters it looked at beyond it and gave back (orange), and, faded, everything consumed before; what is not faded remains to be read. The parser is a table-driven SLR(1) parser; when its next action is a reduction whatever the next token is, it reduces first and fetches no token. A lexical error is a position where no token rule matches; a syntax error is a token the parser cannot use in its current state.",
    "In an action, `$1`, `$2`, … are the attribute values of the right-hand side symbols and `$$` is the value of the left side. `$$.name` and `$1.name` are named attributes; a bare `$1` is the attribute `val`; a token has `lexeme` and `val` (and `type` for int and float tokens). A rule without an action copies the attributes of `$1`.",
    "An action is a list of statements separated by `;`: assignments to `$$`, `$$.name` or a local name; calls; arithmetic, comparison, `and`, `or`, `not` and `c ? a : b`. A bare word such as `float` is a string.",
    "Functions: `newtemp()` a fresh temporary, `emit(op, a, b, result)` append a quadruple, `lookup(name)` and `install(name, type)` for the symbol table, `widen(t1, t2)`, `coerce(place, from, to)` (emits a conversion such as `int2float`), `require(condition, message)`, `error(message)`, `trunc(x)`.",
    "The tree shows the attributes of every node once the grammar has actions. The Results panel shows what the actions produce: the value of the input, the quadruples, the symbol table with types, and messages.",
  ],
  notation: [
    ["lexeme", "the characters of the input that make up one token"],
    ["token", "a name (the terminal) with the lexeme it stands for"],
    ["look-ahead", "the token the parser has been given but not yet shifted"],
    ["stack", "states of the parser with the symbols that led to them"],
    ["$$, $k", "the attributes of the left side, and of the k-th symbol of the right side"],
    ["quadruple", "(operator, argument 1, argument 2, result): one step of three-address code"],
    ["temporary", "a name tN for an intermediate result"],
  ],
  legend: [
    ["blue", "the lexeme the scanner has just consumed, and the look-ahead token's lexeme until the parser shifts it"],
    ["grey", "faded: everything consumed earlier; the text that is not faded remains to be read"],
    ["orange", "characters the scanner looked at beyond the lexeme, and gave back; the look-ahead token"],
    ["green", "the input was accepted"],
    ["red", "a lexical or syntax error"],
  ],
};
