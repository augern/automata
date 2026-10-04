// The "Guide" button in the top bar and its pop-up: what a tool does, how to use it, what
// its notation and colours mean. Like the Algorithm boxes it is on demand, never in the way.
// Each page names its guide with <body data-guide="nfa">; the texts live in GUIDES below.
// Needs shared.css (the .algo-* modal styles) and ui.css (.guide-*).
(function () {
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // `code` between backticks
  const fmt = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>");

  const COMMON_KEYS = [
    ["← →", "step back and forward (also , and .)"],
    ["Home / End", "restart / run to the end"],
    ["T", "move the arrow keys to the next stepping panel (its header is tinted)"],
    ["F", "focus the current panel; press again to restore the layout"],
  ];
  const COMMON_USE = "The View menu (top right) copies a link to exactly what you see, switches theme, and rearranges the panels. Hovering something in one panel highlights the same thing in the others, in orange.";

  const GUIDES = {
    regex: {
      title: "Regular expressions",
      intro: "Turns a regular expression into a finite automaton and runs strings on it. The construction happens in three stages, one panel each: Thompson's construction builds an NFA, subset construction turns it into a DFA, and minimization merges equivalent DFA states.",
      use: [
        "Type an expression on the left. Operators: `|` union, `*` star, `+` one or more, `?` optional, `( )` grouping, `.` any symbol.",
        "Step through each stage with Step ›, or press ▶| to finish it at once. The tables fill in as you go.",
        "Run a string in the Simulation panel: type one, use the dice for a random accepted string, or pick from ▾.",
        "The Apply / Skip switch in the Minimization panel decides whether the graph and the simulation use the minimal DFA.",
        "Hover a state or edge of the DFA graph to see the matching row or cell of the subset-construction table.",
      ],
      notation: [
        ["q0, q1, …", "states of the NFA"],
        ["D0, D1, …", "states of the DFA from subset construction; each stands for a set of NFA states"],
        ["M0, M1, …", "states of the minimal DFA; each stands for a group of D states that behave the same (shown once minimization has been carried out)"],
        ["ε", "the empty string, or a move that reads no input"],
        ["i, f", "in the Thompson table: the start and accept state of the fragment being built"],
        ["→  *", "start state, accepting state"],
        ["∅", "no transition: the move leads to the empty set"],
        ["✗  ≡", "in the minimization table: a pair of states that can be told apart / that are equivalent"],
      ],
      legend: [["blue", "start state, or the state the simulation is in"], ["green", "accepting state"], ["red", "the string was rejected"]],
    },

    nfa: {
      title: "NFA simulator",
      intro: "Define a nondeterministic finite automaton, with ε-moves if you like, and see how it processes a string. An NFA can be in several states at once, so the simulation shows every possible computation as a tree.",
      use: [
        "Each row of the table is a state and each column an input symbol (plus ε). A cell lists the states reached, separated by commas; leave it blank for no move.",
        "Pick the start state with → and the accepting states with ★. + State and + Symbol grow the automaton.",
        "Type a string (or use the dice, or ▾ for examples) and step through it. The string is accepted if some path ends in an accepting state.",
        "Click a node of the tree for an explanation of that configuration.",
      ],
      notation: [
        ["ε-closure", "all states reachable from a state by ε-moves alone, the state itself included"],
        ["tree node", "a state the NFA can be in after reading the input up to that depth"],
        ["edge label", "the symbol read; ε marks ε-moves taken on the way"],
      ],
      legend: [["blue", "start state; at run time, the states the NFA is in now"], ["green", "accepting state, and the path that accepts"], ["red", "a branch that ended in a non-accepting state"], ["grey", "a dead branch: no move was possible (✗)"]],
    },

    pda: {
      title: "PDA simulator",
      intro: "Define a pushdown automaton, an NFA with a stack, and trace how it reads a string. As with an NFA there may be several computations at once; the Configuration Tree shows all of them.",
      use: [
        "Each row of the rules table is a transition: in state `from`, reading `input`, with `pop` on top of the stack, go to state `to` and push `push`.",
        "Leave `input` blank for an ε-move. Leave `pop` or `push` blank to pop or push nothing. A pushed string is written top first: its leftmost symbol ends up on top.",
        "Choose whether a string is accepted by final state, or by empty stack once the input is used up.",
        "Step through a string. Click a node of the tree to see what that configuration is and how it arose.",
      ],
      notation: [
        ["(q, w, γ)", "a configuration: the current state, the input still unread, and the stack (top first)"],
        ["a, A/BC", "on an edge: read a, pop A, push BC (ε when nothing)"],
        ["⊥", "the initial stack symbol"],
        ["A ⊥ ↑", "a stack listed top first; ↑ marks its bottom end, … means more symbols are hidden"],
      ],
      legend: [["blue", "start state; the configurations the PDA is in now"], ["green", "accepted"], ["red", "rejected: the input ran out without acceptance"], ["grey", "dead end: no rule applied"]],
    },

    tm: {
      title: "Turing machine",
      intro: "Define a deterministic single-tape Turing machine and run it on an input string. The tape, the head and the whole computation are shown.",
      use: [
        "Each row is a state and each column the symbol under the head (□ is the blank). A cell reads `next, write, move`: `q1,X,R` means go to q1, write X, move right.",
        "Use `_` for the blank. An empty cell means the machine halts and rejects.",
        "Mark one accept (A) and one reject (R) state. The machine halts as soon as it reaches either.",
        "Step through, or run to the end. The table under the tape lists the computation step by step.",
      ],
      notation: [
        ["□", "the blank symbol; the tape is blank beyond the input"],
        ["L / R", "move the head one cell left / right"],
        ["q1,X,R", "next state, symbol to write, head move"],
      ],
      legend: [["blue", "start state, and the state the machine is in"], ["green", "accept state"], ["red", "reject state"]],
    },

    ll1: {
      title: "LL(1) parser",
      intro: "Enter a context-free grammar and see how a predictive, top-down parser with one symbol of lookahead would handle it: the FIRST and FOLLOW sets, the parsing table, and a step-by-step parse of a string with its parse tree.",
      use: [
        "Write one rule per line, `A -> α | β`, with symbols separated by spaces. `eps` is the empty string; names such as `E'` are allowed.",
        "Build the tables step by step with Table Step ›, or just read them. If a table cell holds two productions the grammar is not LL(1), and the conflicts are listed under the table.",
        "Parse a string in the simulation panel (the dice makes a random sentence). Each step expands the nonterminal on top of the stack, or matches a terminal with the next input symbol.",
        "A grammar with left recursion is never LL(1); the Grammar Transformations tool can remove it.",
      ],
      notation: [
        ["FIRST(A)", "the terminals a string derived from A can start with"],
        ["FOLLOW(A)", "the terminals that can come right after A"],
        ["M[A, a]", "the table entry for nonterminal A and next input symbol a: which production to use"],
        ["$", "the end of the input"],
        ["(n)", "after an action: the number of the production used, as in the numbered list"],
      ],
      legend: [["blue", "the symbol or table cell in use right now"], ["red", "a conflict"]],
    },

    lr: {
      title: "LR parser",
      intro: "Enter a grammar and build a bottom-up (shift–reduce) parser for it. The buttons at the top choose how much lookahead the parser uses to decide reductions: none for LR(0), FOLLOW sets for SLR(1), full lookahead for LR(1), and LALR(1) is a compact approximation of LR(1). The automaton, the ACTION and GOTO tables and a parse of a string are shown.",
      use: [
        "Write one rule per line, `A -> α | β`, with symbols separated by spaces. `eps` is the empty string.",
        "Step through building the automaton and then the tables. The Coarse / Fine switch sets how much happens in each construction step.",
        "A table cell with two actions is a conflict (red): the grammar does not work with the chosen method. Try a stronger method and see whether the conflict goes away.",
        "Parse a string in the simulation panel (the dice makes a random sentence).",
      ],
      notation: [
        ["I0, I1, …", "states of the automaton; each is a set of items"],
        ["A → α • β", "an item: the dot marks how much of the rule has been recognised"],
        ["sN", "shift: read the symbol and go to state N"],
        ["rN", "reduce by production N"],
        ["acc", "accept"],
        ["GOTO", "the state to go to after a reduction produced a nonterminal"],
        ["s5/r1", "two actions in one cell: a conflict"],
      ],
      legend: [["blue", "the current state or table entry"], ["red", "a conflict"]],
    },

    rewrite: {
      title: "Grammar transformations",
      intro: "Applies a classic transformation to a context-free grammar, one step at a time. Cleanup, ε-elimination, unit elimination and Chomsky normal form go from mild to strict, each building on the ones before; left-recursion elimination prepares a grammar for top-down parsing such as LL(1).",
      use: [
        "Type or pick a grammar on the left, one rule per line, `A -> α | β`; `eps` is the empty string.",
        "Choose the transformation in the top bar, then press Step. The middle panel explains each step; Current Grammar shows the result so far.",
        "Compare the original grammar with the result: the language stays the same (apart from ε where noted), only the form changes.",
      ],
      notation: [
        ["productive", "a nonterminal that can derive some string of terminals"],
        ["reachable", "a symbol that can appear in a derivation from the start symbol"],
        ["nullable", "a nonterminal that can derive ε"],
        ["unit production", "a rule A → B with a single nonterminal on the right"],
        ["Chomsky normal form", "every rule is A → B C or A → a"],
      ],
      legend: [],
    },

    derivation: {
      title: "Grammar derivations",
      intro: "Build a derivation in a grammar: start from the start symbol and repeatedly rewrite part of the current form. Works for context-free grammars and also for context-sensitive and unrestricted ones, whose rules may have several symbols on the left.",
      use: [
        "Click a symbol of the last line, or drag across several, to choose the part to rewrite. Then click a production whose left side matches it in the Productions panel.",
        "Esc clears the selection; `z` undoes the last step.",
        "Random choice applies a random rule at a random place; ▶| keeps going until the derivation ends. Reseed starts again with a new random sequence; the same seed always gives the same derivation.",
      ],
      notation: [
        ["⇒", "one derivation step; the number before it is the production used (hover it for the rule)"],
        ["underlined", "the part that was rewritten in that step"],
        ["✓ derived", "only terminals are left: the derivation produced a word of the language"],
        ["dead end", "no rule applies but nonterminals remain; possible in context-sensitive grammars. Go back and choose differently"],
      ],
      legend: [["blue", "nonterminal symbols"], ["grey", "terminal symbols"]],
    },
  };

  const DOT = { blue: "var(--accent)", green: "var(--st-accept)", red: "var(--st-reject)", grey: "var(--st-dead)", orange: "var(--hot)" };

  function html(g, withKeys) {
    const list = (items) => "<ul class=\"guide-list\">" + items.map((t) => "<li>" + fmt(t) + "</li>").join("") + "</ul>";
    const dl = (rows) => "<dl class=\"guide-terms\">" + rows.map((r) => "<dt>" + esc(r[0]) + "</dt><dd>" + fmt(r[1]) + "</dd>").join("") + "</dl>";
    const legend = g.legend.concat([["orange", "whatever you hover, in every panel where it appears"]]);
    return (
      "<p class=\"guide-intro\">" + fmt(g.intro) + "</p>" +
      "<h3 class=\"guide-h\">How to use it</h3>" + list(g.use.concat([COMMON_USE])) +
      (g.notation.length ? "<h3 class=\"guide-h\">Notation</h3>" + dl(g.notation) : "") +
      "<h3 class=\"guide-h\">Colours</h3><ul class=\"guide-list guide-legend\">" +
        legend.map((l) => "<li><span class=\"guide-dot\" style=\"background:" + DOT[l[0]] + "\"></span>" + fmt(l[1]) + "</li>").join("") + "</ul>" +
      "<h3 class=\"guide-h\">Keys</h3>" + dl(COMMON_KEYS)
    );
  }

  let overlay = null;
  function close() {
    if (overlay) overlay.classList.add("hidden");
    const b = document.getElementById("btn-guide");
    if (b) b.focus();
  }
  function open() {
    const g = GUIDES[document.body.dataset.guide];
    if (!g) return;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "guide-overlay";
      overlay.className = "algo-overlay hidden";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        else if (e.key === "Tab") { e.preventDefault(); overlay.querySelector(".algo-close").focus(); }
      });
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      "<div class=\"algo-modal\"><div class=\"algo-modal-head\"><h2>" + esc(g.title) + "</h2>" +
      "<span class=\"algo-subtitle\">guide</span>" +
      "<button type=\"button\" class=\"algo-close\" title=\"Close (Esc)\" aria-label=\"Close\">×</button></div>" +
      "<div class=\"algo-modal-body guide-body\">" + html(g) + "</div></div>";
    overlay.querySelector(".algo-close").addEventListener("click", close);
    overlay.classList.remove("hidden");
    overlay.querySelector(".algo-close").focus();
  }

  function install() {
    const bar = document.getElementById("topbar");
    if (!bar || !GUIDES[document.body.dataset.guide] || document.getElementById("btn-guide")) return;
    const btn = document.createElement("button");
    btn.id = "btn-guide";
    btn.type = "button";
    btn.className = "guide-btn";
    btn.textContent = "Guide";
    btn.title = "What this tool does, how to use it, and what its notation and colours mean";
    btn.addEventListener("click", open);
    const view = document.getElementById("btn-view");
    bar.insertBefore(btn, view || null);
  }
  document.addEventListener("DOMContentLoaded", install);
})();
