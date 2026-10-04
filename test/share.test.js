const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const S = load("share.js");
const plain = (x) => JSON.parse(JSON.stringify(x));

// ── Codec ─────────────────────────────────────────────────────────────

test("encode/decode round-trips ASCII, ε, accents, CJK and emoji", () => {
  for (const g of ["S -> a S b | eps", "ε □ ⊥ → ∅", "café naïve", "日本語", "emoji 😀 and 𝔘", "line1\nline2\ttab", ""]) {
    assert.deepEqual(plain(S.shareDecode(S.shareEncode({ g }))), { g }, JSON.stringify(g));
  }
});

test("encoding is URL-safe and unpadded", () => {
  const enc = S.shareEncode({ g: "??>>~~ ÿ".repeat(20) });
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
});

test("base64url handles every length mod 3", () => {
  for (let n = 0; n < 12; n++) {
    const obj = { x: "a".repeat(n) };
    assert.deepEqual(plain(S.shareDecode(S.shareEncode(obj))), obj, "n=" + n);
  }
});

test("agrees with Node's own base64url on UTF-8 JSON", () => {
  const obj = { g: "S → aSb | ε ✓ 😀" };
  assert.equal(S.shareEncode(obj), Buffer.from(JSON.stringify(obj), "utf8").toString("base64url"));
  assert.deepEqual(plain(S.shareDecode(Buffer.from(JSON.stringify(obj), "utf8").toString("base64url"))), obj);
});

test("decode never throws and rejects malformed input", () => {
  for (const bad of ["", "!!!", "a", "abcde", "%%%%", "AAAA", "eyJ", "e30=", null, undefined, 42, {}, "x".repeat(70000)]) {
    assert.equal(S.shareDecode(bad), null, String(bad).slice(0, 20));
  }
  // Valid base64url JSON, but not an object
  for (const v of ["[1,2]", "3", '"str"', "null", "true"]) {
    assert.equal(S.shareDecode(Buffer.from(v).toString("base64url")), null, v);
  }
  // Invalid UTF-8 and invalid JSON
  assert.equal(S.shareDecode(Buffer.from([0xff, 0xfe, 0x7b]).toString("base64url")), null);
  assert.equal(S.shareDecode(Buffer.from("{not json").toString("base64url")), null);
});

test("decode does not create prototype pollution from __proto__ keys", () => {
  const evil = Buffer.from('{"__proto__":{"polluted":1},"g":"S -> a"}').toString("base64url");
  const obj = S.shareDecode(evil);
  assert.equal(({}).polluted, undefined);
  assert.equal(obj.g, "S -> a");
});

// ── Text states ───────────────────────────────────────────────────────

test("text state: grammar with mode and simulation input", () => {
  assert.deepEqual(plain(S.shareValidateTextState({ g: "S -> a", m: "LALR1", s: "a a" }, "g", ["LR0", "LALR1"])), { g: "S -> a", s: "a a", m: "LALR1" });
  assert.deepEqual(plain(S.shareValidateTextState({ re: "(a|b)*" }, "re")), { re: "(a|b)*", s: "" });
});

test("text state: optional random seed must be a 32-bit unsigned integer", () => {
  assert.equal(S.shareValidateTextState({ g: "S -> a", sd: 12345 }, "g").sd, 12345);
  assert.equal(S.shareValidateTextState({ g: "S -> a", sd: 0 }, "g").sd, 0);
  assert.equal(S.shareValidateTextState({ g: "S -> a", sd: 4294967295 }, "g").sd, 4294967295);
  assert.equal("sd" in S.shareValidateTextState({ g: "S -> a" }, "g"), false);
  for (const bad of [-1, 1.5, 4294967296, "7", null, NaN, Infinity]) assert.equal(S.shareValidateTextState({ g: "S -> a", sd: bad }, "g"), null, String(bad));
});

test("text state: rejects wrong types, unknown modes and oversize fields", () => {
  assert.equal(S.shareValidateTextState({ g: 5 }, "g"), null);
  assert.equal(S.shareValidateTextState({}, "g"), null);
  assert.equal(S.shareValidateTextState(null, "g"), null);
  assert.equal(S.shareValidateTextState({ g: "x", m: "BOGUS" }, "g", ["LR0"]), null);
  assert.equal(S.shareValidateTextState({ g: "x".repeat(20001) }, "g"), null);
  assert.equal(S.shareValidateTextState({ g: "x", s: "y".repeat(2001) }, "g"), null);
});

// ── NFA ───────────────────────────────────────────────────────────────

const NFA = { states: ["q0", "q1"], alphabet: ["a"], start: 0, accepts: [1], trans: { q0: { a: ["q1"], "ε": [] }, q1: { a: [], "ε": ["q0"] } } };

test("NFA: valid definition round-trips through validation", () => {
  const out = S.shareValidateNFA({ nfa: NFA, s: "aa" });
  assert.deepEqual(plain(out), { nfa: NFA, s: "aa" });
});

test("NFA: fills missing transition cells and drops unknown targets/symbols", () => {
  const out = plain(S.shareValidateNFA({ nfa: { states: ["p", "q"], alphabet: ["a", "b"], start: 1, accepts: [0, 0, 9], trans: { p: { a: ["q", "nope", "q"], zzz: ["p"] } } } }));
  assert.deepEqual(out.nfa.trans.p, { a: ["q"], b: [], "ε": [] });
  assert.deepEqual(out.nfa.trans.q, { a: [], b: [], "ε": [] });
  assert.deepEqual(out.nfa.accepts, [0]);
  assert.equal(out.nfa.start, 1);
});

test("NFA: rejects bad shapes", () => {
  const bad = (patch) => assert.equal(S.shareValidateNFA({ nfa: { ...NFA, ...patch } }), null, JSON.stringify(patch));
  bad({ states: [] });
  bad({ states: ["q0", "q0"] });
  bad({ states: ["__proto__", "q1"] });
  bad({ states: ["has space", "q1"] });
  bad({ states: ["a,b", "q1"] });
  bad({ states: Array.from({ length: 41 }, (_, i) => "q" + i) });
  bad({ alphabet: ["ε"] });
  bad({ alphabet: ["a", "a"] });
  bad({ alphabet: ["toolong"] });
  bad({ start: 5 });
  bad({ start: "0" });
  bad({ accepts: "1" });
  assert.equal(S.shareValidateNFA({}), null);
  assert.equal(S.shareValidateNFA({ nfa: "x" }), null);
});

test("NFA: a transition table keyed with __proto__ cannot pollute", () => {
  const trans = JSON.parse('{"q0":{"a":["q1"]},"__proto__":{"polluted":1}}');
  const out = S.shareValidateNFA({ nfa: { ...NFA, trans } });
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.keys(out.nfa.trans).includes("__proto__"), false);
});

// ── PDA ───────────────────────────────────────────────────────────────

const PDA = { states: ["q0", "q1"], start: 0, accepts: [1], initStack: "⊥", acceptMode: "final-state", rules: [{ from: "q0", input: "a", pop: "⊥", to: "q1", push: "A⊥" }] };

test("PDA: valid definition is accepted unchanged", () => {
  assert.deepEqual(plain(S.shareValidatePDA({ pda: PDA, s: "a" })), { pda: PDA, s: "a" });
});

test("PDA: defaults and rejections", () => {
  const out = S.shareValidatePDA({ pda: { states: ["q0"], start: 0, accepts: [], rules: [] } });
  assert.equal(out.pda.acceptMode, "final-state");
  assert.equal(out.pda.initStack, "");
  assert.equal(S.shareValidatePDA({ pda: { ...PDA, acceptMode: "both" } }), null);
  assert.equal(S.shareValidatePDA({ pda: { ...PDA, rules: [{ from: "q0" }] } }), null);
  assert.equal(S.shareValidatePDA({ pda: { ...PDA, rules: [5] } }), null);
  assert.equal(S.shareValidatePDA({ pda: { ...PDA, rules: Array(201).fill(PDA.rules[0]) } }), null);
  assert.equal(S.shareValidatePDA({ pda: { ...PDA, initStack: "x".repeat(9) } }), null);
});

// ── TM ────────────────────────────────────────────────────────────────

const TM = {
  states: ["q0", "qA", "qR"], alphabet: ["a"], start: 0, accept: 1, reject: 2,
  trans: { q0: { a: { next: "q0", write: "a", dir: "R" }, "□": { next: "qA", write: "□", dir: "R" } }, qA: {}, qR: {} },
};

test("TM: valid definition is accepted unchanged", () => {
  assert.deepEqual(plain(S.shareValidateTM({ tm: TM, s: "aa" })), { tm: TM, s: "aa" });
});

test("TM: drops invalid cells, rejects bad structure", () => {
  const out = plain(S.shareValidateTM({ tm: { ...TM, trans: { q0: { a: { next: "ghost", write: "a", dir: "R" }, b: { next: "q0", write: "a", dir: "R" }, "□": { next: "q0", write: "a", dir: "X" } } } } }));
  assert.deepEqual(out.tm.trans.q0, {});
  assert.equal(S.shareValidateTM({ tm: { ...TM, accept: 7 } }), null);
  assert.equal(S.shareValidateTM({ tm: { ...TM, alphabet: ["□"] } }), null);
  assert.equal(S.shareValidateTM({ tm: { ...TM, alphabet: ["_"] } }), null);
});
