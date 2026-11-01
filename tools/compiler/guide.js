// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey.
window.TOOL_GUIDE = {
  title: "Compiler front end",
  intro: "A scanner, an LR parser and semantic actions on one input: the parser fetches a token when it needs one, and actions on reductions compute values, types and three-address code.",
  grammarEditor: true,
  use: [
    "Token rules are a table as in the Scanner tool; the name is the terminal the grammar uses (quoted if special, as `'+'`).",
    "A terminal needs a token rule of the same name. The ⋯ menu of a production has Add action: code that runs when the parser reduces by it; in the text view `{{ … }}` after an alternative. A grammar without actions only parses.",
    "The Scanner DFA sits above the parser's automaton; the machine that has just moved is accented. Coarse steps go one scanner call or parser action; Fine adds one step per character read. Pointing at a token, a token rule, an accepting state or a terminal marks the others.",
    "The Input row shows the lexeme consumed (blue), the characters looked at beyond it and given back (orange) and, faded, everything consumed before. The parser is table-driven SLR(1); a reduction that does not depend on the next token is made before fetching one. A lexical error is a position where no rule matches; a syntax error is a token the parser cannot use.",
    "Actions: `$1`, `$2`, … are the attribute values of the right side, `$$` that of the left side; `$$.name` is a named attribute and a bare `$1` is `val`. A token has `lexeme`, `val` and, for int and float, `type`. A rule without an action copies `$1`.",
    "Statements are separated by `;`: assignments to `$$`, `$$.name` or a local name; calls; arithmetic, comparison, `and`, `or`, `not`, `c ? a : b`. A bare word such as `float` is a string.",
    "Functions: `newtemp()` a fresh temporary, `newlabel()` a fresh label, `emit(op, a, b, result)` append a quadruple and return its number, `nextquad()` the next number, `patch(i, target)` set the jump target of quadruple i (shown as `(n)`), `emitparams(list)` one `param` quadruple per place of a list such as `t1,t2`, `lookup(name)` and `install(name, type)` for the symbol table, `widen(t1, t2)`, `coerce(place, from, to)` (emits a conversion such as `int2float`), `require(condition, message)`, `error(message)`, `trunc(x)`.",
    "Accepted postfix code or quadruples run on a machine under the Results, with its own stepper; starting values, array contents and input are editable. Postfix: an identifier is pushed as an address, `:=` stores, `L1 JEQZ` jumps to `L1:` when the value is 0, `L1 JUMP` always. Quadruples: `:=` copies; `JEQZ` and `JUMP` go to quadruple (n); `[]= A i t` makes t the address of A[i], `=[] A i t` loads A[i]; `param x` adds an argument, `call f n` calls f with the last n (WRITE writes, READ reads, others are only noted).",
    "The tree shows each node's attributes. Results: the value of the input, the quadruples, the symbol table with types, and messages.",
  ],
  notation: [
    ["look-ahead", "the token the parser has been given but not yet shifted"],
    ["stack", "states of the parser with the symbols that led to them"],
    ["$$, $k", "attributes of the left side, and of the k-th symbol of the right side"],
  ],
  legend: [
    ["blue", "the lexeme just consumed; the look-ahead token's lexeme until it is shifted"],
    ["grey", "faded: consumed earlier"],
    ["orange", "characters looked at beyond the lexeme and given back; the look-ahead token"],
    ["green", "the input was accepted"],
    ["red", "a lexical or syntax error"],
  ],
};
