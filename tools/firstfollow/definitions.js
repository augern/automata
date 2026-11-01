// The Definitions pop-up for this tool (see shared/definitions.js): the formal definitions it rests on, with their sources.
// Formulas are LaTeX (the subset of shared/algo/tex.js). A source is a key of refs, optionally followed by a section.
window.TOOL_DEFINITIONS = {
  title: "FIRST & FOLLOW",
  refs: {
    alsu: "A. V. Aho, M. S. Lam, R. Sethi, J. D. Ullman: Compilers: Principles, Techniques, and Tools, 2nd ed. Addison-Wesley, 2006.",
    hmu: "J. E. Hopcroft, R. Motwani, J. D. Ullman: Introduction to Automata Theory, Languages, and Computation, 3rd ed. Pearson, 2006.",
    sipser: "M. Sipser: Introduction to the Theory of Computation, 3rd ed. Cengage, 2012.",
    appel: "A. W. Appel: Modern Compiler Implementation in Java, 2nd ed. Cambridge University Press, 2002.",
    rs: "D. J. Rosenkrantz, R. E. Stearns: Properties of deterministic top-down grammars. Information and Control 17(3), 1970, pp. 226–256.",
  },
  sections: [
    {
      title: "Grammars and derivations",
      items: [
        {
          term: "Context-free grammar",
          formal: ["G = (N, \\Sigma, P, S)", "N, \\Sigma \\text{ finite and disjoint};\\quad P \\subseteq N \\times (N \\cup \\Sigma)^{*}, \\text{ written } A \\to \\alpha;\\quad S \\in N"],
          text: "N holds the nonterminals, Σ the terminals, S is the start symbol.",
          refs: ["hmu §5.1.2", "sipser Def. 2.2"],
        },
        {
          term: "Derivation",
          formal: ["\\alpha \\Rightarrow \\beta \\quad\\text{iff}\\quad \\alpha = \\gamma A \\delta,\\; A \\to \\eta \\in P,\\; \\beta = \\gamma \\eta \\delta", "\\Rightarrow^{*} \\text{ is the reflexive and transitive closure of } \\Rightarrow"],
          refs: ["hmu §5.1.3"],
        },
        {
          term: "Sentential form, sentence, language",
          formal: ["\\alpha \\in (N \\cup \\Sigma)^{*} \\text{ is a sentential form iff } S \\Rightarrow^{*} \\alpha", "\\text{a sentential form in } \\Sigma^{*} \\text{ is a sentence};\\quad L(G) = \\{\\, w \\in \\Sigma^{*} \\mid S \\Rightarrow^{*} w \\,\\}"],
          refs: ["hmu §5.1.5–5.1.6"],
        },
      ],
    },
    {
      title: "Nullable, FIRST and FOLLOW",
      items: [
        {
          term: "Nullable",
          formal: ["A \\in N \\text{ is nullable} \\quad\\text{iff}\\quad A \\Rightarrow^{*} \\varepsilon", "X_1 \\ldots X_n \\text{ is nullable} \\quad\\text{iff}\\quad \\text{every } X_i \\text{ is}\\quad (\\varepsilon \\text{ is nullable})"],
          refs: ["hmu §7.1.3", "appel §3.2"],
        },
        {
          term: "FIRST",
          formal: ["\\mathrm{FIRST}(\\alpha) = \\{\\, a \\in \\Sigma \\mid \\alpha \\Rightarrow^{*} a\\beta \\text{ for some } \\beta \\in (N \\cup \\Sigma)^{*} \\,\\}", "\\varepsilon \\in \\mathrm{FIRST}(\\alpha) \\quad\\text{iff}\\quad \\alpha \\Rightarrow^{*} \\varepsilon"],
          text: "The terminals a string derived from α can start with. ε is included when α is nullable.",
          refs: ["alsu §4.4.2", "appel §3.2", "rs"],
        },
        {
          term: "FIRST of a string",
          formal: ["\\mathrm{FIRST}(X_1 \\ldots X_n) = \\bigcup_{X_1 \\ldots X_{i-1} \\text{ nullable}} \\mathrm{FIRST}(X_i) \\setminus \\{\\varepsilon\\}", "\\varepsilon \\in \\mathrm{FIRST}(X_1 \\ldots X_n) \\quad\\text{iff}\\quad X_1 \\ldots X_n \\text{ nullable}"],
          text: "FIRST of each symbol up to and including the first that is not nullable.",
          refs: ["alsu §4.4.2"],
        },
        {
          term: "FOLLOW",
          formal: ["\\mathrm{FOLLOW}(A) = \\{\\, a \\in \\Sigma \\mid S \\Rightarrow^{*} \\alpha A a \\beta \\text{ for some } \\alpha, \\beta \\in (N \\cup \\Sigma)^{*} \\,\\}", "\\$ \\in \\mathrm{FOLLOW}(A) \\quad\\text{iff}\\quad S \\Rightarrow^{*} \\alpha A;\\quad \\text{in particular } \\$ \\in \\mathrm{FOLLOW}(S)"],
          text: "The terminals that can come right after A in a sentential form. $ is an end marker, not a terminal of the grammar.",
          refs: ["alsu §4.4.2", "appel §3.2", "rs"],
        },
      ],
    },
  ],
};
