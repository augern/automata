# Automata & Parser Tools

Interactive browser-based teaching tools for formal language theory, covering
regular languages, context-free grammars and parsing, and Turing machines.

| Tool | Coverage |
|---|---|
| **Regular Expression Tool** | Thompson's NFA construction — RE → NFA (step-by-step), NFA → DFA (subset construction, step-by-step), DFA string simulation |
| **NFA Simulator** | ε-NFA — editable transition table, NFA graph, nondeterministic simulation tree |
| **Grammar Transformations Tool** | Grammar cleanup, ε-production elimination, unit production elimination, Chomsky Normal Form (CNF), left-recursion elimination, Greibach Normal Form (GNF) |
| **Grammar Derivations Tool** | Manual derivations for CFG, CSG and Type 0 grammars — select a range, choose a rule, build the sentential form step by step, or let a seeded "Random choice" stepper derive for you (Back/forward, Reseed, ←/→ keys, seed kept in share links) |
| **PDA Simulator** | Nondeterministic PDA / ε-PDA — transition rule list, automaton graph, configuration-set simulation |
| **Pumping Explorer** | Why the pumping lemmas hold: a repeated state on a DFA's path and a repeated nonterminal on a parse tree's path, pumped step by step |
| **Backtracking Recursive Descent** | The procedures generated from a grammar and the search for a parse — guesses, backtracking and dead ends as a call tree, the read position over time, linked to the highlighted code; complete search, ordered choice or packrat (memoised), left recursion detected |
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
├── index.html                          ← landing page: the tools on a map of the Chomsky hierarchy, with a list view (the narrow-window fallback)
├── ui-kit.html                         ← living gallery of every shared UI component
├── tools/                              ← one directory per tool; everything exclusive to a tool lives in it
│   ├── regex/                          ← regular expression → NFA → DFA → minimal DFA
│   ├── nfa/                            ← NFA simulator
│   ├── grammar-rewrite/                ← grammar transformations
│   ├── derivation/                     ← grammar derivations
│   ├── pda/                            ← PDA simulator
│   ├── pumping/                        ← pumping explorer
│   ├── rdp/                            ← backtracking recursive descent
│   ├── ll1/                            ← LL(1) parser
│   ├── lr/                             ← LR parser
│   └── tm/                             ← Turing machine simulator
│                                       each holds:  index.html     the page (its own layout, CSS and logic)
│                                                    guide.js       the text of its Guide pop-up
│                                                    examples.json  its example menu
├── vendor/
│   ├── d3.min.js                       ← D3 7.9.0 (ISC), bundled so the tools work offline
│   ├── dagre.min.js                    ← Dagre 0.8.5 (MIT)
│   └── LICENSE-*.txt
├── shared/
│   ├── algo/
│   │   ├── grammar.js                  ← pure: BNF parser, FIRST/FOLLOW, esc() (no DOM)
│   │   ├── derivation.js               ← pure: derivation-grammar parser, range matching, done check, seeded random moves
│   │   ├── strings.js                  ← pure: random input strings (automaton walks, sampling, grammar sentences)
│   │   ├── lr.js                       ← pure: LR(0)/LR(1)/LALR(1) automata, ACTION/GOTO tables
│   │   ├── pumping.js                  ← pure: DFA text, pigeonhole loop, parse-tree pumping
│   │   ├── rdp.js                      ← pure: recursive-descent procedures, the recorded parse run (complete or ordered choice), state at a step, node explanations
│   │   ├── ll1.js                      ← pure: LL(1) table construction, predictive-parser step
│   │   ├── panels.js                   ← pure: panel drag, auto-collapse fitting
│   │   ├── nfa.js                      ← pure: ε-closure, NFA simulation tree, exact acceptance
│   │   ├── pda.js                      ← pure: PDA configurations, simulation tree, exact acceptance
│   │   ├── regex.js                    ← pure: Thompson NFA, subset construction, DFA minimisation
│   │   ├── rewrite.js                  ← pure: grammar cleanup, ε/unit elimination, CNF, left recursion, GNF
│   │   └── tm.js                       ← pure: TM tape and pre-run
│   ├── theme.js                        ← light/dark theme (system default, remembered toggle)
│   ├── ui.css                          ← shared components (ui-*, ag-*, ct-*); built on the tokens in shared.css
│   ├── ui.js                           ← UI.banner, UI.logBar, UI.table builders
│   ├── fit-view.js                     ← pan/zoom and automatic fit-to-view, shared by every graph and tree view
│   ├── automaton-graph.js              ← dagre/d3 state diagrams for NFA/PDA/TM, with linked hover (edges, states <-> definition tables)
│   ├── share-link.js                   ← URL-fragment state and the copy-link action
│   ├── view-menu.js                    ← the top bar's View menu (share, theme, layout presets)
│   ├── guide.js                        ← the top bar's Guide button and pop-up (the mechanism; each tool supplies its text in tools/<tool>/guide.js)
│   ├── stepper.js                      ← Back/Step/Reset/Run-all control for recorded simulations
│   ├── shared.css                      ← common visual language — edit to retheme all tools
│   └── shared.js                       ← common logic (parse tree,
│                                          panel layout, example loader, modal behaviour,
│                                          automata simulation helpers)
├── scripts/
│   ├── stamp.js                        ← writes the ?v= cache-busting stamps (npm run stamp)
│   └── serve.py                        ← no-cache local dev server
├── test/                               ← node:test suites for shared/algo/ (npm test)
├── package.json                        ← test script only; no runtime dependencies
├── LICENSE                             ← MIT
└── .gitlab-ci.yml                      ← GitLab Pages deployment
```

`shared.css`, `shared.js` and `algo/grammar.js` are required by all tools
(`algo/grammar.js` must be loaded before `shared.js`; `algo/strings.js` for the random-string buttons; `algo/lr.js`, `algo/ll1.js`, `algo/rdp.js`, `algo/derivation.js`, `algo/nfa.js`, `algo/pda.js`, `algo/regex.js`, `algo/rewrite.js`, `algo/tm.js` (and `algo/states.js` for the three automata tools) only where needed).
D3 and Dagre are bundled in `vendor/`; there are no CDN dependencies at runtime.

> **Adding or editing examples**: each tool's examples live in its own
> `tools/<tool>/examples.json`. No HTML changes are needed — just edit the JSON.
> The text of a tool's Guide pop-up is `tools/<tool>/guide.js`.

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
          "purpose": "One sentence: what this example demonstrates (shown as a tooltip in the examples menu; required)",
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
- Examples may carry more fields for their tool: the recursive-descent tool reads `strings` (sample inputs, the first is loaded) and `mode` (`full`, `ordered` or `packrat`).
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

## Shared UI framework

The look is defined once. `shared/shared.css` holds the **design tokens**
(colours, a 4px spacing scale, a type scale, control height, motion, and
status colours such as `--st-accept` / `--st-reject`) plus the base styles and
one keyboard focus ring. `shared/ui.css` holds **components** built only from
those tokens, named `ui-block`, `ui-block__part`, `ui-block--variant`,
`is-state`; `shared/ui.js` holds their behaviour (`UI.banner`, `UI.logBar`, `UI.menu`, `UI.toast`,
`UI.table` builders that escape their input, plus `createStepper`,
`createGraphView`/`drawAutomatonGraph` and the share-link helpers).

**Dark theme.** Every colour is a token, so the dark theme is a second set of
token values (`:root[data-theme="dark"]` in `shared.css`). `shared/theme.js`
picks the theme (your system setting by default; the theme item in the **View**
menu stores an explicit choice) and is loaded in `<head>` to avoid a
flash of the wrong theme. `test/theme.test.js` computes WCAG contrast for the
text and status pairs in both themes, and checks that the dark theme overrides
every colour token, so a new token can't silently stay light.

Open [`ui-kit.html`](ui-kit.html) to see every component rendered. The rule for
new work: if a tool needs a control, a status colour or a panel layout, add it
to the kit and the shared files first; tool CSS should only contain what is
unique to that tool (the TM tape, the PDA stack chips, panel widths).

All eight tools now use the shared components. What remains in each tool's own
CSS is specific to it: the LR item-set diagram and parse tables, the derivation
chips, the TM tape and trace table, the regex DFA graph and pair table.

---

## Panel layout

Every tool is a row of resizable panels (`#panels`). The row behaves like this:

- **Proportional.** Each panel has a weight (`--pw`, its pixel width at a ~1400px
  window) and a minimum (`--pmin`). Panels share the row in proportion to their
  weights, so growing or shrinking the window scales every panel together.
  Weights, not pixels, are saved, so a layout restores sensibly at any window size.
- **Split-pane handles.** A handle moves the boundary between the panels on
  either side and leaves the others alone. Drag it, nudge it with the arrow keys
  (Shift for bigger steps), or double-click to restore the designed proportions.
- **Nothing is hidden by accident.** If the minimums don't fit, the panels with
  the lowest `data-priority` collapse to a labelled strip and return when there
  is room. Opening a strip in a cramped window makes room by collapsing the next
  lowest panel. Panels you collapse yourself stay collapsed. If even that isn't
  enough the row scrolls sideways.
- **Collapse controls.** The chevron (a 24px target; it leans the way the panel
  will move and its tooltip names the action) collapses a panel. A collapsed
  panel is a 36px strip with an expand button and a rotated label; the whole
  strip highlights on hover, and clicking it (or Enter/Space) opens it. Dragging a
  handle well past a panel's minimum collapses that panel, and dragging back
  reopens it. The panel with keyboard focus gets an accent rule under its header.
- **Keyboard stepping and key focus.** Each panel with a stepper (Back / Step /
  Reset / Run all) registers it with `registerStepper(panelId, {step, back, reset,
  end})`. One such panel at a time has *key focus*: its header is tinted blue with a
  `← →` hint after the title, and the keys act on it. `←`/`→` (or `,`/`.`) step back
  and forward, `Home` resets, `End` runs to the end, and `T` / `Shift+T` move key
  focus to the next/previous stepping panel. `F` focuses the tinted panel (or the
  last panel you used, in tools without steppers) and, pressed again, restores the
  layout. Clicking or tabbing into a stepping
  panel moves key focus there; the View menu lists the panels too. The keys are
  ignored while you type in a field or while a menu or dialog is open. This
  replaces the old per-tool handlers, LR's "Arrow Keys" selector and LL(1)'s
  Shift+arrow, and gives the regex tool (four steppers) keyboard stepping.
- **Panel menus.** Each header has a `⋯` menu holding the panel's secondary
  actions (Algorithm, view toggles) plus "Focus on this panel" and "Collapse
  panel", which keeps headers uncluttered. "Focus on this panel" is undoable: it
  remembers the layout from before, and while that panel is the only one open its
  menu item becomes **Restore layout** (the View menu has the same item). Changing
  the layout by hand, or using another layout preset, ends the focused state. The buttons themselves stay in the
  markup (hidden) and are triggered from the menu.
- **View menu.** The top bar's right-hand **View** menu has Copy link, the
  light/dark theme switch, and layout presets: *Restore default layout*, *Equal
  panel widths*, *Expand all panels* and *Focus on* each panel.

To add a panel: give it `data-priority`, and in the tool CSS set `--pw` and
`--pmin`. The layout logic is `shared/algo/panels.js` (tested) and the panel
section of `shared/shared.js`.

---

## Shareable links

Every tool keeps its current input in the URL fragment (`#s=…`), and
**View → Copy link to this view** copies it. Opening a link restores the
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
python3 scripts/serve.py 8080     # or: npm run serve
```
Then open **http://localhost:8080** in your browser. `scripts/serve.py` is
`python3 -m http.server` plus a no-cache header, so edits to `shared/*.js` and
`shared/*.css` show up on a normal reload (the plain server lets browsers cache
them, which can leave a new page running an old script).

### Node.js

```bash
npx serve .
```

### VS Code

Install the **Live Server** extension, right-click `index.html` → *Open with Live Server*.

### Cache-busting stamps

Every `<script src>` and `<link href>` into `shared/` or `vendor/` carries
`?v=<hash of the file>`, so a browser can never combine a new page with a stale
cached script (the symptom is an error such as `UI.menu is not a function`). After
editing anything under `shared/` or `vendor/`, run:

```bash
npm run stamp
```

`npm test` fails (`test/stamps.test.js`) until the stamps match, so a forgotten
stamp is caught before it ships.

---

## Deploying to GitLab Pages

The repository includes `.gitlab-ci.yml`. Push to `main` and GitLab CI will
automatically publish the site at:

```
https://<username>.gitlab.io/<repo-name>/
```

No build step is needed — the tools are plain HTML/CSS/JS.
