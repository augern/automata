const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const { EPSILON, regexToNFA, subsetConstruct, minimizeDFA, dfaRun, generateExamples } = load("grammar.js", "regex.js");

// Reference matcher: the NFA by set simulation, independent of the DFA code.
function nfaAccepts(nfa, input) {
  const closure = (seeds) => {
    const C = new Set(seeds);
    const stack = [...seeds];
    while (stack.length) {
      const s = stack.pop();
      for (const t of nfa.trans) if (t.from === s && t.sym === EPSILON && !C.has(t.to)) { C.add(t.to); stack.push(t.to); }
    }
    return C;
  };
  let cur = closure([nfa.start]);
  for (const ch of input) {
    const nxt = new Set();
    for (const t of nfa.trans) if (cur.has(t.from) && t.sym === ch) nxt.add(t.to);
    cur = closure([...nxt]);
  }
  return cur.has(nfa.accept);
}

// Same language via the JS regex engine (our syntax is a subset of JS's).
const jsMatch = (re, w) => new RegExp("^(?:" + re + ")$").test(w);

function strings(alphabet, maxLen) {
  const out = [""];
  let layer = [""];
  for (let l = 1; l <= maxLen; l++) {
    layer = layer.flatMap((s) => [...alphabet].map((c) => s + c));
    out.push(...layer);
  }
  return out;
}

const REGEXES = ["a", "ab", "a|b", "a*", "a+", "a?", "(a|b)*abb", "(ab)*", "a*b*", "(a|b)*a(a|b)", "(a*b)*", "a(b|c)*d", "(a|b)+", "((a|b)(a|b))*", "a?b?c?"];

test("Thompson: state counts match the construction (2 per symbol/union/star/plus/opt, none for concat)", () => {
  assert.equal(regexToNFA("a").numStates, 2);
  assert.equal(regexToNFA("ab").numStates, 4);
  assert.equal(regexToNFA("a|b").numStates, 6);
  assert.equal(regexToNFA("a*").numStates, 4);
  // (a|b)*abb: 5 symbols (10 states) + union (2) + star (2). The textbook's 11-state
  // Fig. 3.34 merges the endpoints of concatenated fragments; this construction does not.
  assert.equal(regexToNFA("(a|b)*abb").numStates, 14);
});

test("Thompson NFAs have one start, one accept, and no transition out of accept", () => {
  for (const re of REGEXES) {
    const nfa = regexToNFA(re);
    assert.equal(nfa.trans.filter((t) => t.from === nfa.accept).length, 0, re);
    assert.equal(nfa.trans.filter((t) => t.to === nfa.start).length, 0, re);
  }
});

test("NFA, DFA and minimal DFA all agree with the JS regex engine on all strings up to length 6", () => {
  const words = strings("abcd", 6).filter((w) => w.length <= 4 || /^[ab]*$/.test(w));
  for (const re of REGEXES) {
    const nfa = regexToNFA(re);
    const dfa = subsetConstruct(nfa);
    const min = minimizeDFA(dfa);
    for (const w of words) {
      const expected = jsMatch(re, w);
      assert.equal(nfaAccepts(nfa, w), expected, `NFA ${re} on "${w}"`);
      assert.equal(dfaRun(dfa, w).accepted, expected, `DFA ${re} on "${w}"`);
      assert.equal(dfaRun(min, w).accepted, expected, `min DFA ${re} on "${w}"`);
    }
  }
});

test("(a|b)*abb: 5 DFA states (Fig. 3.36) minimize to 4 (states A and C merge)", () => {
  const dfa = subsetConstruct(regexToNFA("(a|b)*abb"));
  assert.equal(dfa.dfaStates.length, 5);
  assert.equal(dfa.dfaAccepts.size, 1);
  const min = minimizeDFA(dfa);
  assert.equal(min.alreadyMinimal, false);
  assert.equal(min.dfaStates.length, 4);
  assert.equal(min.groups.length, 4);
  assert.ok(min.groups.some((g) => g.length === 2));
});

test("a minimal DFA reports alreadyMinimal", () => {
  const min = minimizeDFA(subsetConstruct(regexToNFA("(a|b)*a(a|b)")));
  assert.equal(min.alreadyMinimal, false);
  const again = minimizeDFA(subsetConstruct(regexToNFA("ab")));
  assert.equal(again.alreadyMinimal, true);
});

test("minimization merges equivalent states: (a|b)*a(a|b) → 4 states; ((a|b)(a|b))* → 2", () => {
  assert.equal(minimizeDFA(subsetConstruct(regexToNFA("(a|b)*a(a|b)"))).dfaStates.length, 4);
  assert.equal(minimizeDFA(subsetConstruct(regexToNFA("((a|b)(a|b))*"))).dfaStates.length, 2);
  assert.equal(minimizeDFA(subsetConstruct(regexToNFA("a|a"))).dfaStates.length, 2);
});

test("minimized DFA has its start state at 0 and is never larger than the DFA", () => {
  for (const re of REGEXES) {
    const dfa = subsetConstruct(regexToNFA(re));
    const min = minimizeDFA(dfa);
    assert.ok(min.dfaStates.length <= dfa.dfaStates.length, re);
    assert.equal(dfaRun(min, "").accepted, jsMatch(re, ""), re);
  }
});

test("a missing transition makes dfaRun fail with state -1 and the dead state is implicit", () => {
  const dfa = subsetConstruct(regexToNFA("ab"));
  assert.deepEqual({ ...dfaRun(dfa, "ac") }, { state: -1, accepted: false });
  assert.equal(minimizeDFA(dfa).DEAD, dfa.dfaStates.length);
  assert.equal(minimizeDFA(subsetConstruct(regexToNFA("(a|b)*"))).DEAD, -1);
});

test("subset construction steps: init first, done last, one 'trans' per DFA edge", () => {
  const dfa = subsetConstruct(regexToNFA("(a|b)*abb"));
  assert.equal(dfa.steps[0].type, "init");
  assert.equal(dfa.steps.at(-1).type, "done");
  assert.equal(dfa.steps.at(-1).nStates, 5);
  assert.equal(dfa.steps.filter((s) => s.type === "trans").length, dfa.dfaTrans.length);
  assert.equal(dfa.steps.filter((s) => s.type === "trans" && s.isNew).length, 4);
});

test("onStep reports every construction step, and the last snapshot is the whole NFA", () => {
  const steps = [];
  const nfa = regexToNFA("(a|b)*abb", (s) => steps.push(s));
  assert.deepEqual(steps.map((s) => s.op).slice(0, 3), ["symbol", "symbol", "union"]);
  assert.equal(steps.filter((s) => s.op === "symbol").length, 5);
  assert.equal(steps.at(-1).snapshot.length, nfa.trans.length);
  assert.equal(steps.at(-1).frag.start, nfa.start);
  assert.equal(steps.at(-1).frag.accept, nfa.accept);
  // Recording must not change the result.
  assert.deepEqual(JSON.parse(JSON.stringify(regexToNFA("(a|b)*abb"))), JSON.parse(JSON.stringify(nfa)));
});

test("escapes and ε", () => {
  const star = regexToNFA("\\*a");
  assert.ok(nfaAccepts(star, "*a"));
  assert.equal(nfaAccepts(star, "a"), false);
  assert.ok(nfaAccepts(regexToNFA("ε"), ""));
  assert.ok(nfaAccepts(regexToNFA("aε|b"), "a"));
});

test("syntax errors", () => {
  assert.throws(() => regexToNFA(""), /Empty expression/);
  assert.throws(() => regexToNFA("(a"), /Unmatched \(/);
  assert.throws(() => regexToNFA("a)"), /Unmatched \)|Unexpected character/);
  assert.throws(() => regexToNFA("*a"), /Unexpected operator '\*'/);
  assert.throws(() => regexToNFA("a|"), /Unexpected end/);
  assert.throws(() => regexToNFA("a\\"), /Trailing/);
  assert.throws(() => regexToNFA("()"), /Unmatched \)/);
});

test("generateExamples lists shortest accepted strings first and respects the limits", () => {
  const dfa = subsetConstruct(regexToNFA("a*b"));
  assert.deepEqual([...generateExamples(dfa, 4, 10)], ["b", "ab", "aab", "aaab"]);
  assert.equal(generateExamples(dfa, 7, 2).length, 2);
  assert.deepEqual([...generateExamples(subsetConstruct(regexToNFA("a*")), 2, 10)], ["", "a", "aa"]);
});

// ── step spans (which characters of the expression each step builds) ───
(function () {
  const { regexToNFA } = load("grammar.js", "regex.js");
  const steps = (re) => { const out = []; regexToNFA(re, (st) => out.push(st)); return out; };
  test("construction steps report the characters they build and the fragments they combine", () => {
    const st = steps("(a|b)*abb");
    assert.deepEqual([...st[0].span], [1, 2]);          // a
    assert.equal(st[0].operands.length, 0);
    const union = st.find((s) => s.op === "union");
    assert.deepEqual([...union.span], [1, 4]);           // a|b
    assert.equal(union.opAt, 2);
    assert.deepEqual([...union.operands.map((o) => [...o.span])], [[1, 2], [3, 4]]);
    const star = st.find((s) => s.op === "star");
    assert.deepEqual([...star.span], [0, 6]);            // (a|b)* — parentheses and operator included
    assert.equal(star.opAt, 5);
    assert.deepEqual([...star.operands[0].span], [0, 5]); // the parenthesised operand
    const last = st[st.length - 1];
    assert.deepEqual([...last.span], [0, 9]);            // the whole expression
    assert.equal(last.op, "concat");
  });
  test("escapes and ε count as one atom with the right span", () => {
    const st = steps("a\\*ε");
    assert.deepEqual([...st[1].span], [1, 3]);
    const eps = st.find((x) => x.op === "eps");
    assert.deepEqual([...eps.span], [3, 4]);
  });
})();
