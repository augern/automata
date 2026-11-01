// The Definitions pop-up for this tool (see shared/definitions.js): the formal definitions it rests on, with their sources.
// A source is a key of refs, optionally followed by a section.
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
          formal: ["G = (N, Σ, P, S)", "N, Σ finite and disjoint;  P ⊆ N × (N ∪ Σ)*, written A → α;  S ∈ N"],
          text: "N holds the nonterminals, Σ the terminals, S is the start symbol.",
          refs: ["hmu §5.1.2", "sipser Def. 2.2"],
        },
        {
          term: "Derivation",
          formal: ["α ⇒ β  iff  α = γAδ,  A → η ∈ P,  β = γηδ", "⇒*  is the reflexive and transitive closure of ⇒"],
          refs: ["hmu §5.1.3"],
        },
        {
          term: "Sentential form, sentence, language",
          formal: ["α ∈ (N ∪ Σ)* is a sentential form iff S ⇒* α", "a sentential form in Σ* is a sentence;  L(G) = { w ∈ Σ* | S ⇒* w }"],
          refs: ["hmu §5.1.5–5.1.6"],
        },
      ],
    },
    {
      title: "Nullable, FIRST and FOLLOW",
      items: [
        {
          term: "Nullable",
          formal: ["A ∈ N is nullable  iff  A ⇒* ε", "X₁ … Xₙ is nullable  iff  every Xᵢ is  (ε is nullable)"],
          refs: ["hmu §7.1.3", "appel §3.2"],
        },
        {
          term: "FIRST",
          formal: ["FIRST(α) = { a ∈ Σ | α ⇒* aβ for some β ∈ (N ∪ Σ)* }", "ε ∈ FIRST(α)  iff  α ⇒* ε"],
          text: "The terminals a string derived from α can start with. ε is included when α is nullable.",
          refs: ["alsu §4.4.2", "appel §3.2", "rs"],
        },
        {
          term: "FIRST of a string",
          formal: ["FIRST(X₁ … Xₙ) = ⋃ { FIRST(Xᵢ) ∖ {ε} | X₁ … Xᵢ₋₁ nullable }", "ε ∈ FIRST(X₁ … Xₙ)  iff  X₁ … Xₙ nullable"],
          text: "FIRST of each symbol up to and including the first that is not nullable.",
          refs: ["alsu §4.4.2"],
        },
        {
          term: "FOLLOW",
          formal: ["FOLLOW(A) = { a ∈ Σ | S ⇒* αAaβ for some α, β ∈ (N ∪ Σ)* }", "$ ∈ FOLLOW(A)  iff  S ⇒* αA;  in particular $ ∈ FOLLOW(S)"],
          text: "The terminals that can come right after A in a sentential form. $ is an end marker, not a terminal of the grammar.",
          refs: ["alsu §4.4.2", "appel §3.2", "rs"],
        },
      ],
    },
    {
      title: "Computing the sets",
      items: [
        {
          term: "Closure rules",
          formal: [
            "A → Y₁ … Yₖ, every Yᵢ nullable  ⟹  A nullable",
            "A → Y₁ … Yₖ, Y₁ … Yᵢ₋₁ nullable  ⟹  FIRST(Yᵢ) ∖ {ε} ⊆ FIRST(A)",
            "$ ∈ FOLLOW(S)",
            "A → αBβ  ⟹  FIRST(β) ∖ {ε} ⊆ FOLLOW(B)",
            "A → αBβ, β nullable  ⟹  FOLLOW(A) ⊆ FOLLOW(B)",
          ],
          text: "The sets are the least sets that satisfy every rule. Applying the rules until a round changes nothing, the fixpoint, computes them.",
          refs: ["alsu §4.4.2", "appel §3.2"],
        },
      ],
    },
  ],
};
