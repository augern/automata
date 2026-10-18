// The Guide pop-up for this tool (see shared/guide.js): what it does, how to use it, notation and colours.
// Legend colour names: blue, green, red, grey, orange.
window.TOOL_GUIDE = {
  title: "Types and symbol table",
  intro: "Computes types while parsing. The type of an expression is an attribute computed bottom-up from the types of its parts; declarations install variables in the symbol table, and an assignment or an operator uses it. Where an int meets a float, a conversion appears in the quadruples.",
  use: [
    "The definition uses the same actions as the Syntax-Directed Translation tool. `$$.type` holds the type of an expression, `$$.place` where its value is kept (a name or a temporary).",
    "`widen(t1, t2)` is float if either type is float. `coerce(place, from, to)` emits a conversion quadruple such as `int2float` and returns the place of the converted value, or `place` itself when no conversion is needed.",
    "`install(name, type)` and `lookup(name)` use the symbol table, which is shown in the Types panel. `require(condition, message)` reports a type or scope error without stopping the parse; the messages are listed in the panel.",
    "Step through the run to see each type appear on the tree as the nodes are built.",
  ],
  notation: [
    ["int, float", "the two numeric types; an int literal is a sequence of digits, a float literal has a point"],
    ["int2float", "the quadruple that converts an int to a float"],
    ["symbol table", "the names declared so far, with their types"],
  ],
  legend: [
    ["blue", "the lexeme the scanner just bit off"],
    ["orange", "characters looked at and given back; the look-ahead token"],
    ["green", "the input was accepted"],
    ["red", "an error"],
  ],
};
