// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey, orange.
window.TOOL_GUIDE = {
  title: "Syntax-directed translation",
  intro: "Attaches actions to grammar rules. The parser runs the action of a rule when it reduces by it, so values and code are produced bottom-up as the parse tree is built. The scanner and the parser run as in the Scanner and Parser tool.",
  use: [
    "Write an action in `{{ … }}` after the symbols of an alternative. In an action, `$1`, `$2`, … are the attribute values of the right-hand side symbols and `$$` is the value of the left side. `$$.name` and `$1.name` are named attributes; a bare `$1` is the attribute `val`. A rule without an action copies the attributes of `$1`.",
    "An action is a list of statements separated by `;`: assignments to `$$`, `$$.name` or a local name; calls; arithmetic, comparison, `and`, `or`, `not` and `c ? a : b`. A bare word such as `float` is a string.",
    "Functions: `newtemp()` a fresh temporary, `emit(op, a, b, result)` append a quadruple, `lookup(name)` and `install(name, type)` for the symbol table, `widen(t1, t2)`, `coerce(place, from, to)`, `require(condition, message)`, `error(message)`, `trunc(x)`.",
    "The parse tree shows the attributes of every node. The Translation panel shows the value of the whole input and the quadruples produced so far.",
  ],
  notation: [
    ["$$, $k", "the attributes of the left side, and of the k-th symbol of the right side"],
    ["quadruple", "(operator, argument 1, argument 2, result): one step of three-address code"],
    ["temporary", "a name tN for an intermediate result"],
  ],
  legend: [
    ["blue", "the lexeme the scanner just bit off"],
    ["orange", "characters looked at and given back; the look-ahead token"],
    ["green", "the input was accepted"],
    ["red", "an error"],
  ],
};
