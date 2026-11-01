// The definitions that the tools' Definitions pop-ups draw on (see shared/definitions.js), and the sources they cite. A tool lists
// the keys of the items it wants in tools/<tool>/definitions.js; an item is stated here once. Formulas are LaTeX (shared/algo/tex.js).
//   item: { term, formal: [LaTeX], text?, refs: ["source" | "source §section"] }
(function () {
const T = String.raw;
window.DEF_LIBRARY = {
  sources: {
    alsu: "A. V. Aho, M. S. Lam, R. Sethi, J. D. Ullman: Compilers: Principles, Techniques, and Tools, 2nd ed. Addison-Wesley, 2006.",
    appel: "A. W. Appel: Modern Compiler Implementation in Java, 2nd ed. Cambridge University Press, 2002.",
    bps: "Y. Bar-Hillel, M. Perles, E. Shamir: On formal properties of simple phrase structure grammars. Zeitschrift für Phonetik, Sprachwissenschaft und Kommunikationsforschung 14, 1961, pp. 143–172.",
    chomsky59: "N. Chomsky: On certain formal properties of grammars. Information and Control 2(2), 1959, pp. 137–167.",
    deremer71: "F. L. DeRemer: Simple LR(k) grammars. Communications of the ACM 14(7), 1971, pp. 453–460.",
    greibach: "S. A. Greibach: A new normal-form theorem for context-free phrase structure grammars. Journal of the ACM 12(1), 1965, pp. 42–52.",
    hmu: "J. E. Hopcroft, R. Motwani, J. D. Ullman: Introduction to Automata Theory, Languages, and Computation, 3rd ed. Pearson, 2006.",
    kleene: "S. C. Kleene: Representation of events in nerve nets and finite automata. In: Automata Studies, Princeton University Press, 1956, pp. 3–41.",
    knuth65: "D. E. Knuth: On the translation of languages from left to right. Information and Control 8(6), 1965, pp. 607–639.",
    ls68: "P. M. Lewis II, R. E. Stearns: Syntax-directed transduction. Journal of the ACM 15(3), 1968, pp. 465–488.",
    rabin: "M. O. Rabin, D. Scott: Finite automata and their decision problems. IBM Journal of Research and Development 3(2), 1959, pp. 114–125.",
    rs: "D. J. Rosenkrantz, R. E. Stearns: Properties of deterministic top-down grammars. Information and Control 17(3), 1970, pp. 226–256.",
    sipser: "M. Sipser: Introduction to the Theory of Computation, 3rd ed. Cengage, 2012.",
    turing: "A. M. Turing: On computable numbers, with an application to the Entscheidungsproblem. Proceedings of the London Mathematical Society s2-42, 1936–37, pp. 230–265.",
  },
  items: {
    // ── Finite automata and regular expressions ──
    dfa: {
      term: "Deterministic finite automaton",
      formal: [T`M = (Q, \Sigma, \delta, q_0, F)`, T`\delta : Q \times \Sigma \to Q`, T`\delta^{*}(q, \varepsilon) = q, \quad \delta^{*}(q, wa) = \delta(\delta^{*}(q, w), a)`, T`L(M) = \{\, w \in \Sigma^{*} \mid \delta^{*}(q_0, w) \in F \,\}`],
      refs: ["hmu §2.2", "sipser Def. 1.5"],
    },
    nfa: {
      term: "Nondeterministic finite automaton",
      formal: [T`N = (Q, \Sigma, \delta, q_0, F)`, T`\delta : Q \times (\Sigma \cup \{\varepsilon\}) \to \mathcal{P}(Q)`],
      refs: ["hmu §2.3, §2.5", "sipser Def. 1.37", "rabin"],
    },
    eclose: {
      term: "ε-closure and extended transition",
      formal: [
        T`q \in \mathrm{ECLOSE}(q), \quad p \in \mathrm{ECLOSE}(q),\; r \in \delta(p, \varepsilon) \Longrightarrow r \in \mathrm{ECLOSE}(q)`,
        T`\delta^{*}(S, \varepsilon) = \mathrm{ECLOSE}(S), \quad \delta^{*}(S, wa) = \mathrm{ECLOSE}(\bigcup_{p \in \delta^{*}(S, w)} \delta(p, a))`,
        T`L(N) = \{\, w \in \Sigma^{*} \mid \delta^{*}(\{q_0\}, w) \cap F \ne \emptyset \,\}`,
      ],
      text: "The least set of states reachable by ε-moves.",
      refs: ["hmu §2.5"],
    },
    regex: {
      term: "Regular expression",
      formal: [
        T`L(\emptyset) = \emptyset, \quad L(\varepsilon) = \{\varepsilon\}, \quad L(a) = \{a\}`,
        T`L(R \mid S) = L(R) \cup L(S), \quad L(RS) = L(R)L(S), \quad L(R^{*}) = \bigcup_{k \ge 0} L(R)^{k}`,
      ],
      text: "Star binds tighter than concatenation, concatenation tighter than alternation.",
      refs: ["hmu §3.1", "sipser Def. 1.52", "kleene"],
    },
    kleene: {
      term: "Regular languages",
      formal: [],
      text: "Regular expressions, DFAs and NFAs, with or without ε-moves, define the same languages.",
      refs: ["hmu §3.2", "rabin", "kleene"],
    },
    minimise: {
      term: "Minimal DFA",
      formal: [T`p \equiv q \quad\text{iff}\quad \forall w \in \Sigma^{*} : \delta^{*}(p, w) \in F \Leftrightarrow \delta^{*}(q, w) \in F`],
      text: "Its states are the classes of ≡ among the reachable states.",
      refs: ["hmu §4.4"],
    },
    // ── Grammars and derivations ──
    cfg: {
      term: "Context-free grammar",
      formal: [T`G = (N, \Sigma, P, S)`, T`N, \Sigma \text{ finite and disjoint};\quad P \subseteq N \times (N \cup \Sigma)^{*}, \text{ written } A \to \alpha;\quad S \in N`],
      refs: ["hmu §5.1.2", "sipser Def. 2.2"],
    },
    derivation: {
      term: "Derivation",
      formal: [T`\alpha \Rightarrow \beta \quad\text{iff}\quad \alpha = \gamma A \delta,\; A \to \eta \in P,\; \beta = \gamma \eta \delta`, T`\overset{*}{\Rightarrow} \text{ is the reflexive and transitive closure of } \Rightarrow`],
      refs: ["hmu §5.1.3"],
    },
    sentential: {
      term: "Sentential form, sentence, language",
      formal: [T`\alpha \in (N \cup \Sigma)^{*} \text{ is a sentential form iff } S \overset{*}{\Rightarrow} \alpha`, T`\text{a sentential form in } \Sigma^{*} \text{ is a sentence};\quad L(G) = \{\, w \in \Sigma^{*} \mid S \overset{*}{\Rightarrow} w \,\}`],
      refs: ["hmu §5.1.5–5.1.6"],
    },
    leftmost: {
      term: "Leftmost and rightmost derivation",
      formal: [T`\alpha \Rightarrow_{\mathrm{lm}} \beta \quad\text{iff}\quad \alpha = wA\gamma,\; A \to \eta \in P,\; \beta = w\eta\gamma,\; w \in \Sigma^{*}`, T`\alpha \Rightarrow_{\mathrm{rm}} \beta \quad\text{iff}\quad \alpha = \gamma A w,\; A \to \eta \in P,\; \beta = \gamma\eta w,\; w \in \Sigma^{*}`],
      refs: ["hmu §5.1.4"],
    },
    parseTree: {
      term: "Parse tree",
      formal: [T`A \to X_1 \ldots X_k \in P \quad\text{for an interior node } A \text{ with children } X_1, \ldots, X_k`],
      text: "Parse trees, leftmost derivations and rightmost derivations of a sentence correspond one to one.",
      refs: ["hmu §5.2"],
    },
    ambiguity: {
      term: "Ambiguity",
      formal: [],
      text: "Some sentence of L(G) has two parse trees, equivalently two leftmost derivations.",
      refs: ["hmu §5.4"],
    },
    chomsky: {
      term: "Chomsky hierarchy",
      formal: [
        T`\alpha \to \beta, \quad \alpha \in (N \cup \Sigma)^{*} N (N \cup \Sigma)^{*}, \quad \beta \in (N \cup \Sigma)^{*} \qquad \text{type 0}`,
        T`|\alpha| \le |\beta| \qquad \text{type 1, context-sensitive}`,
        T`\alpha = A \in N \qquad \text{type 2, context-free}`,
        T`A \to aB, \quad A \to a, \quad A \to \varepsilon \qquad \text{type 3, regular}`,
      ],
      text: "Each class contains the next; in type 1 a start symbol that occurs on no right side may derive ε.",
      refs: ["chomsky59"],
    },
    // ── Nullable, FIRST and FOLLOW ──
    nullable: {
      term: "Nullable",
      formal: [T`A \in N \text{ is nullable} \quad\text{iff}\quad A \overset{*}{\Rightarrow} \varepsilon`, T`X_1 \ldots X_n \text{ is nullable} \quad\text{iff}\quad \text{every } X_i \text{ is}\quad (\varepsilon \text{ is nullable})`],
      refs: ["hmu §7.1.3", "appel §3.2"],
    },
    first: {
      term: "FIRST",
      formal: [T`\mathrm{FIRST}(\alpha) = \{\, a \in \Sigma \mid \alpha \overset{*}{\Rightarrow} a\beta \text{ for some } \beta \in (N \cup \Sigma)^{*} \,\}`, T`\varepsilon \in \mathrm{FIRST}(\alpha) \quad\text{iff}\quad \alpha \overset{*}{\Rightarrow} \varepsilon`],
      refs: ["alsu §4.4.2", "appel §3.2", "rs"],
    },
    firstString: {
      term: "FIRST of a string",
      formal: [T`\mathrm{FIRST}(X_1 \ldots X_n) = \bigcup_{X_1 \ldots X_{i-1} \text{ nullable}} \mathrm{FIRST}(X_i) \setminus \{\varepsilon\}`, T`\varepsilon \in \mathrm{FIRST}(X_1 \ldots X_n) \quad\text{iff}\quad X_1 \ldots X_n \text{ nullable}`],
      refs: ["alsu §4.4.2"],
    },
    follow: {
      term: "FOLLOW",
      formal: [T`\mathrm{FOLLOW}(A) = \{\, a \in \Sigma \mid S \overset{*}{\Rightarrow} \alpha A a \beta \text{ for some } \alpha, \beta \in (N \cup \Sigma)^{*} \,\}`, T`\$ \in \mathrm{FOLLOW}(A) \quad\text{iff}\quad S \overset{*}{\Rightarrow} \alpha A;\quad \text{in particular } \$ \in \mathrm{FOLLOW}(S)`],
      text: "$ is an end marker, not a terminal of the grammar.",
      refs: ["alsu §4.4.2", "appel §3.2", "rs"],
    },
    // ── Pushdown automata and Turing machines ──
    pda: {
      term: "Pushdown automaton",
      formal: [T`P = (Q, \Sigma, \Gamma, \delta, q_0, Z_0, F)`, T`\delta : Q \times (\Sigma \cup \{\varepsilon\}) \times \Gamma \to \mathcal{P}(Q \times \Gamma^{*}) \text{ (finite subsets)}`],
      text: "Γ is the stack alphabet, Z₀ the initial stack symbol; the top of the stack is written first.",
      refs: ["hmu §6.1"],
    },
    pdaConfig: {
      term: "Configuration and move",
      formal: [T`(q, w, \gamma) \in Q \times \Sigma^{*} \times \Gamma^{*}`, T`(q, aw, X\gamma) \vdash (p, w, \beta\gamma) \quad\text{if}\quad (p, \beta) \in \delta(q, a, X),\; a \in \Sigma \cup \{\varepsilon\}`],
      refs: ["hmu §6.2"],
    },
    pdaAccept: {
      term: "Acceptance by final state and by empty stack",
      formal: [T`L(P) = \{\, w \mid (q_0, w, Z_0) \overset{*}{\vdash} (q, \varepsilon, \gamma),\; q \in F \,\}`, T`N(P) = \{\, w \mid (q_0, w, Z_0) \overset{*}{\vdash} (q, \varepsilon, \varepsilon) \,\}`],
      text: "A language is context-free exactly when some PDA accepts it, by either criterion.",
      refs: ["hmu §6.2, §6.3", "sipser Thm. 2.20"],
    },
    tm: {
      term: "Turing machine",
      formal: [T`M = (Q, \Sigma, \Gamma, \delta, q_0, q_{\mathrm{acc}}, q_{\mathrm{rej}})`, T`\sqcup \in \Gamma \setminus \Sigma, \quad \Sigma \subseteq \Gamma, \quad \delta : Q \times \Gamma \to Q \times \Gamma \times \{L, R\}`],
      text: "The tape is unbounded to the right and holds the input followed by blanks; the head moves left or right after each write.",
      refs: ["sipser Def. 3.3", "hmu §8.2", "turing"],
    },
    tmConfig: {
      term: "Configuration, acceptance and language",
      formal: [
        T`u\, q\, a v \vdash u\, b\, p\, v \quad\text{if}\quad \delta(q, a) = (p, b, R)`,
        T`u c\, q\, a v \vdash u\, p\, c b\, v \quad\text{if}\quad \delta(q, a) = (p, b, L)`,
        T`L(M) = \{\, w \in \Sigma^{*} \mid q_0 w \overset{*}{\vdash} u\, q_{\mathrm{acc}}\, v \,\}`,
      ],
      text: "u q v: tape uv, head on the first symbol of v, state q. L(M) is recursively enumerable; decidable if M halts on every input.",
      refs: ["sipser §3.1", "hmu §8.2"],
    },
    // ── Pumping lemmas ──
    pumpRegular: {
      term: "Pumping lemma for regular languages",
      formal: [T`L \text{ regular} \Longrightarrow \exists p \ge 1\; \forall w \in L,\; |w| \ge p :`, T`w = xyz, \quad |xy| \le p, \quad |y| \ge 1, \quad xy^{i}z \in L \text{ for all } i \ge 0`],
      text: "In a DFA with p states a path of p symbols visits some state twice; the loop between the visits is y.",
      refs: ["hmu §4.1", "sipser Thm. 1.70", "rabin"],
    },
    pumpContextFree: {
      term: "Pumping lemma for context-free languages",
      formal: [T`L \text{ context-free} \Longrightarrow \exists p \ge 1\; \forall w \in L,\; |w| \ge p :`, T`w = uvxyz, \quad |vxy| \le p, \quad |vy| \ge 1, \quad uv^{i}xy^{i}z \in L \text{ for all } i \ge 0`],
      text: "On a long enough path some nonterminal A repeats, with A ⇒* vAy and A ⇒* x.",
      refs: ["hmu §7.2", "sipser Thm. 2.34", "bps"],
    },
    // ── Top-down parsing ──
    leftRecursion: {
      term: "Left recursion",
      formal: [T`A \overset{+}{\Rightarrow} A\alpha \quad\text{for some } A \in N,\; \alpha`],
      text: "A top-down parser that expands the leftmost nonterminal first loops on it.",
      refs: ["alsu §4.3.3"],
    },
    ll1: {
      term: "LL(1) grammar",
      formal: [
        T`\mathrm{FIRST}(\alpha) \cap \mathrm{FIRST}(\beta) = \emptyset`,
        T`\beta \overset{*}{\Rightarrow} \varepsilon \;\Longrightarrow\; \mathrm{FIRST}(\alpha) \cap \mathrm{FOLLOW}(A) = \emptyset`,
      ],
      text: "Both conditions hold for every pair of different productions A → α and A → β, with α and β in either role: the next token and the left-hand side decide the production.",
      refs: ["alsu §4.4.3", "ls68", "rs"],
    },
    ll1Table: {
      term: "Predictive parsing table",
      formal: [T`A \to \alpha \in M[A, a] \quad\text{iff}\quad a \in \mathrm{FIRST}(\alpha) \;\text{or}\; (\varepsilon \in \mathrm{FIRST}(\alpha) \text{ and } a \in \mathrm{FOLLOW}(A))`],
      text: "a ranges over the terminals and $. A grammar is LL(1) exactly when no entry has more than one production.",
      refs: ["alsu §4.4.3"],
    },
    // ── Bottom-up parsing ──
    handle: {
      term: "Handle",
      formal: [T`S \overset{*}{\Rightarrow}_{\mathrm{rm}} \alpha A w \Rightarrow_{\mathrm{rm}} \alpha \beta w`],
      text: "Reducing a handle undoes a step of a rightmost derivation.",
      refs: ["alsu §4.5", "knuth65"],
    },
    lrItem: {
      term: "LR(0) and LR(1) items",
      formal: [T`[A \to \alpha \cdot \beta] \qquad [A \to \alpha \cdot \beta, a]`],
      text: "The dot marks how much of the right side has been recognised; an LR(1) item adds a lookahead terminal.",
      refs: ["alsu §4.6, §4.7", "knuth65"],
    },
    lrTable: {
      term: "ACTION and GOTO",
      formal: [
        T`\mathrm{shift}\; j \in \mathrm{ACTION}[i, a] \quad\text{if}\quad [A \to \alpha \cdot a\beta] \in I_i,\; \mathrm{goto}(I_i, a) = I_j`,
        T`\mathrm{reduce}\; A \to \alpha \in \mathrm{ACTION}[i, a] \quad\text{if}\quad [A \to \alpha \cdot] \in I_i \;\text{and}\; a \in \Lambda`,
        T`\mathrm{GOTO}[i, A] = j \quad\text{if}\quad \mathrm{goto}(I_i, A) = I_j`,
      ],
      text: "Λ is all terminals for LR(0), FOLLOW(A) for SLR(1), the lookahead of the LR(1) item for LR(1), and the same after merging item sets that differ only in lookaheads for LALR(1). A cell with two actions is a conflict.",
      refs: ["alsu §4.6, §4.7", "deremer71", "knuth65"],
    },
    // ── Grammar transformations ──
    useless: {
      term: "Useless symbols",
      formal: [T`X \text{ generating} \quad\text{iff}\quad X \overset{*}{\Rightarrow} w \text{ for some } w \in \Sigma^{*}`, T`X \text{ reachable} \quad\text{iff}\quad S \overset{*}{\Rightarrow} \alpha X \beta \text{ for some } \alpha, \beta`],
      text: "A symbol is useful when it is both generating and reachable.",
      refs: ["hmu §7.1.1"],
    },
    unit: {
      term: "Unit pair",
      formal: [T`(A, B) \text{ unit pair} \quad\text{iff}\quad A \overset{*}{\Rightarrow} B \text{ by unit productions only}`],
      text: "A unit production has a single nonterminal as its right side.",
      refs: ["hmu §7.1.4"],
    },
    cnf: {
      term: "Chomsky normal form",
      formal: [T`A \to BC, \quad A \to a \qquad (B, C \in N,\; a \in \Sigma)`],
      text: "Every ε-free context-free language has a grammar in this form.",
      refs: ["chomsky59", "hmu §7.1.5"],
    },
    gnf: {
      term: "Greibach normal form",
      formal: [T`A \to a\alpha \qquad (a \in \Sigma,\; \alpha \in N^{*})`],
      text: "Every ε-free context-free language has a grammar in this form; each step of a derivation produces one terminal.",
      refs: ["greibach"],
    },
    // ── Scanners and syntax-directed translation ──
    token: {
      term: "Token, pattern and lexeme",
      formal: [],
      text: "A token rule pairs a name with a pattern, a regular expression; a lexeme is a string of the input that matches it.",
      refs: ["alsu §3.1"],
    },
    sdd: {
      term: "Syntax-directed definition",
      formal: [T`A \to \alpha \quad\text{with rules}\quad b = f(c_1, \ldots, c_k)`],
      text: "Synthesized: computed from the children; inherited: from the parent and siblings. S-attributed: synthesized attributes only, evaluable bottom-up while parsing.",
      refs: ["alsu §5.1"],
    },
    tac: {
      term: "Three-address code",
      formal: [T`x = y \;\mathrm{op}\; z`],
      text: "At most one operator and three addresses (names, constants, temporaries).",
      refs: ["alsu §6.2"],
    },
  },
};
})();
