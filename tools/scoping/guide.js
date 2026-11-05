window.TOOL_GUIDE = {
  title: "Scoping and Environments",
  intro: "Runs a small program under a chosen scoping rule and parameter-passing mode, one event at a time, and shows what the program's names stand for: the environment (frames, with their names) and the store (locations, with their values).",
  use: [
    "Edit the program or pick an example. The mode buttons in the top bar choose static or dynamic scoping and how arguments are passed.",
    "Step with the buttons or the arrow keys. Fine steps also stop at each lookup of a name and each evaluation of a by-name argument.",
    "Compare runs the program in all eight combinations; a click on a cell switches to it.",
    "Hovering a location in one place marks it everywhere.",
  ],
  notation: [
    ["frame", "The names of a block or of one call, innermost first. A call frame has a static link (where the procedure was defined) and a dynamic link (the caller)."],
    ["L3", "A location in the store. Two names bound to the same location are aliases."],
    ["name ≡ e", "A by-name parameter: a thunk for the argument e, with the number of times it has been evaluated."],
    ["array 0", "An array variable holds a reference to the array; its elements are locations of their own."],
  ],
  legend: [
    ["blue", "the frame where a lookup found its name"],
    ["red", "a lookup that failed, or an error"],
    ["green", "a location changed by the step"],
    ["grey", "the link that the chosen scoping rule does not follow"],
  ],
};
