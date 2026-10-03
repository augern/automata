# Automata & Parser Tools

Interactive browser-based teaching tools for formal language theory, covering
regular languages, context-free grammars and parsing, and Turing machines.

| Tool | Coverage |
|---|---|
| **Regular Expression Tool** | Thompson's NFA construction — RE → NFA (step-by-step), NFA → DFA (subset construction, step-by-step), DFA string simulation |
| **NFA Simulator** | ε-NFA — editable transition table, NFA graph, nondeterministic simulation tree |
| **Grammar Transformations Tool** | Grammar cleanup, ε-production elimination, unit production elimination, Chomsky Normal Form (CNF), left-recursion elimination |
| **Grammar Derivations Tool** | Manual derivations for CFG, CSG and Type 0 grammars — select a range, choose a rule, build the sentential form step by step |
| **PDA Simulator** | Nondeterministic PDA / ε-PDA — transition rule list, automaton graph, configuration-set simulation |
| **LL(1) Parser Tool** | Predictive parsing — FIRST/FOLLOW sets, predictive table M[A,a], derivation steps, string simulation, parse tree |
| **LR Parser Tool** | LR(0), SLR(1), LALR(1), LR(1) — characteristic automaton, ACTION/GOTO tables, string simulation, parse tree |
| **Turing Machine Simulator** | Deterministic TM — editable transition table, tape simulation, step-by-step execution |

All tools share a common visual language (academic, high-contrast) and support
step-by-step algorithm visualisation with Back/Forward controls.

> **Mobile / narrow screens:** these tools use a multi-panel side-by-side
> layout designed for a desktop browser at ≥ 1200 px width. They are not
> usable on phones or small tablets.

---

## File structure

```
parser-tools/
├── index.html                          ← landing page
├── tools/
│   ├── regex-tool.html                 ← regular expression / NFA / DFA tool
│   ├── nfa-tool.html                   ← NFA simulator
│   ├── grammar-rewrite-tool.html       ← grammar transformation tool
│   ├── derivation-tool.html            ← grammar derivation tool
│   ├── pda-tool.html                   ← PDA simulator
│   ├── ll1-tool.html                   ← LL(1) parser tool
│   ├── lr-tool.html                    ← LR parser tool
│   └── tm-tool.html                    ← Turing machine simulator
├── examples/
│   ├── examples-regex.json             ← example expressions for Regular Expression tool
│   ├── examples-nfa.json               ← example automata for NFA tool
│   ├── examples-grammar-rewrite.json   ← example grammars for Grammar Transformations tool
│   ├── examples-derivation.json        ← example grammars for Grammar Derivations tool
│   ├── examples-pda.json               ← example automata for PDA tool
│   ├── examples-ll1.json               ← example grammars for LL(1) tool
│   ├── examples-lr.json                ← example grammars for LR tool
│   └── examples-tm.json                ← example machines for Turing Machine tool
├── vendor/
│   ├── d3.min.js                       ← D3 7.9.0 (ISC), bundled so the tools work offline
│   ├── dagre.min.js                    ← Dagre 0.8.5 (MIT)
│   └── LICENSE-*.txt
├── shared/
│   ├── algo/
│   │   ├── grammar.js                  ← pure: BNF parser, FIRST/FOLLOW, esc() (no DOM)
│   │   ├── derivation.js               ← pure: derivation-grammar parser, range matching, done check
│   │   ├── lr.js                       ← pure: LR(0)/LR(1)/LALR(1) automata, ACTION/GOTO tables
│   │   ├── ll1.js                      ← pure: LL(1) table construction, predictive-parser step
│   │   ├── nfa.js                      ← pure: ε-closure, NFA simulation tree, exact acceptance
│   │   ├── pda.js                      ← pure: PDA configurations, simulation tree, exact acceptance
│   │   ├── regex.js                    ← pure: Thompson NFA, subset construction, DFA minimization
│   │   ├── rewrite.js                  ← pure: grammar cleanup, ε/unit elimination, CNF, left recursion
│   │   └── tm.js                       ← pure: TM tape and pre-run
│   ├── automaton-graph.js              ← dagre/d3 state-diagram rendering for NFA/PDA/TM
│   ├── share-link.js                   ← URL-fragment state, Share button
│   ├── stepper.js                      ← Back/Step/Reset/Run-all control for recorded simulations
│   ├── shared.css                      ← common visual language — edit to retheme all tools
│   └── shared.js                       ← common logic (parse tree,
│                                          panel layout, example loader, modal behaviour,
│                                          automata simulation helpers)
├── test/                               ← node:test suites for shared/algo/ (npm test)
├── package.json                        ← test script only; no runtime dependencies
├── LICENSE                             ← MIT
└── .gitlab-ci.yml                      ← GitLab Pages deployment
```

`shared.css`, `shared.js` and `algo/grammar.js` are required by all tools
(`algo/grammar.js` must be loaded before `shared.js`; `algo/lr.js`, `algo/ll1.js`, `algo/derivation.js`, `algo/nfa.js`, `algo/pda.js`, `algo/regex.js`, `algo/rewrite.js`, `algo/tm.js` (and `algo/states.js` for the three automata tools) only where needed).
D3 and Dagre are bundled in `vendor/`; there are no CDN dependencies at runtime.

> **Adding or editing examples**: each tool's examples live in the corresponding
> `examples-*.json` file. No HTML changes are needed — just edit the JSON.

### Example JSON format

Each file has the structure:

```json
{
  "groups": [
    {
      "label": "Group name",
      "examples": [
        {
          "label": "Display name",
          "text": [
            "// Optional comment",
            "S -> A B",
            "A -> a | eps"
          ]
        }
      ]
    }
  ]
}
```

- **`groups`** maps to `<optgroup>` elements in the dropdown.
- **`label`** is the display text shown in the dropdown.
- **`text`** is an array of lines; the loader joins them with `\n` before passing the grammar to the tool. No `\n` escapes needed.
- There is no `value`/ID field — the loader assigns stable positional keys (`ex0`, `ex1`, …) automatically.

Shared sections in `shared.js` are delimited by comments:

```
// ━━━ SHARED:PARSE-TREE ━━━
// ━━━ SHARED:PANEL-LAYOUT ━━━
// ━━━ SHARED:EXAMPLE-GENERATOR ━━━
// ━━━ SHARED:PSEUDOCODE ━━━
// ━━━ SHARED:EXAMPLES-LOADER ━━━
// ━━━ SHARED:MODAL ━━━
// ━━━ SHARED:SIM-HELPERS ━━━
// ━━━ SHARED:TABLE-STEPPER ━━━
// ━━━ SHARED:UTILITIES ━━━
// ━━━ SHARED:TRANS-INPUT ━━━
```

---

## Shareable links

Every tool keeps its current input in the URL fragment (`#s=…`), and the
**Share** button in the top bar copies the link. Opening a link restores the
grammar, regular expression, or automaton definition (plus the tool's mode and
the simulation string). The fragment is never sent to a server.

The data in a link is untrusted, so it is decoded defensively: anything
malformed, oversized or of the wrong shape is ignored and the tool opens with
its default example. Old LR-tool links (`?g=…`) still work. States too large for
a link (over 8000 characters) are not written to the address bar.

---

## Tests

The algorithm modules in `shared/algo/` have no DOM access and are covered by
tests that check results against textbook answers (state counts and conflicts
from the dragon book, FIRST/FOLLOW sets). They need Node 18+ and no packages:

```bash
npm test
```

The modules are plain classic scripts, so the browser loads them unchanged;
`test/load.js` evaluates them in a `vm` context.

---

## Running locally

> **Why a server?** Browsers block `<script src="...">` and `<link href="...">` for
> local `file://` URLs (CORS policy). A minimal HTTP server is required.

### Python (no install required)

```bash
python3 -m http.server 8080
```
Then open **http://localhost:8080** in your browser.

### Node.js

```bash
npx serve .
```

### VS Code

Install the **Live Server** extension, right-click `index.html` → *Open with Live Server*.

---

## Deploying to GitLab Pages

The repository includes `.gitlab-ci.yml`. Push to `main` and GitLab CI will
automatically publish the site at:

```
https://<username>.gitlab.io/<repo-name>/
```

No build step is needed — the tools are plain HTML/CSS/JS.
