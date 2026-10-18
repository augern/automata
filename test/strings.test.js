const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");
const { parseBNF } = load("grammar.js");
const S = load("strings.js");

// A small deterministic rng (mulberry32).
function rngFrom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("strRandomWord stays within the alphabet and length", () => {
  const rng = rngFrom(1);
  for (let i = 0; i < 200; i++) {
    const w = S.strRandomWord(["a", "b"], rng, 5);
    assert.ok(w.length <= 5 && /^[ab]*$/.test(w));
  }
  assert.equal(S.strRandomWord([], rng), "");
});

test("strWalkAccepted only produces strings the automaton accepts", () => {
  // (ab)* with a dead-end branch on c
  const edges = [
    { from: 0, to: 1, sym: "a" }, { from: 1, to: 0, sym: "b" },
    { from: 0, to: 2, sym: "c" }, // 2 cannot reach acceptance
  ];
  const rng = rngFrom(7);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const w = S.strWalkAccepted(edges, 0, new Set([0]), rng);
    assert.match(w, /^(ab)*$/);
    seen.add(w);
  }
  assert.ok(seen.size > 2, "variety: " + [...seen]);
});

test("strWalkAccepted follows ε-moves without emitting them, and returns null with no accepting state", () => {
  const edges = [{ from: "p", to: "q", sym: "ε" }, { from: "q", to: "r", sym: "x" }];
  assert.equal(S.strWalkAccepted(edges, "p", ["r"], rngFrom(3)), "x");
  assert.equal(S.strWalkAccepted(edges, "r", ["p"], rngFrom(3)), null);
});

test("strSampleAccepted finds accepted words, or falls back to a word", () => {
  const hit = S.strSampleAccepted(["a", "b"], (w) => /^a+b$/.test(w), rngFrom(5));
  assert.equal(hit.accepted, true);
  assert.match(hit.value, /^a+b$/);
  const miss = S.strSampleAccepted(["a"], () => false, rngFrom(5), { tries: 5 });
  assert.equal(miss.accepted, false);
  assert.match(miss.value, /^a*$/);
});

test("grammarRandomSentence derives sentences of the grammar and varies", () => {
  const g = parseBNF("E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id");
  const rng = rngFrom(11);
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const s = S.grammarRandomSentence(g, rng);
    assert.ok(s && s.length);
    assert.ok([...s].every((t) => !g.nonterminals.has(t)));
    let depth = 0;
    for (const t of s) { depth += t === "(" ? 1 : t === ")" ? -1 : 0; assert.ok(depth >= 0); }
    assert.equal(depth, 0);
    assert.ok(s[0] !== "+" && s[s.length - 1] !== "+" && s[s.length - 1] !== "*");
    seen.add(s.join(" "));
  }
  assert.ok(seen.size > 20);
});

test("strTokenise: whitespace when there is any, else cut at the terminals (longest first)", () => {
  const { load } = require("./load.js");
  const { strTokenise } = load("strings.js");
  const T = new Set(["(", ")", "|", "*", "a", "b", "id", "$"]);
  assert.deepEqual([...strTokenise(T, "(a|b)*ab")], ["(", "a", "|", "b", ")", "*", "a", "b"]);
  assert.deepEqual([...strTokenise(T, "id a")], ["id", "a"]);
  assert.deepEqual([...strTokenise(T, "idid")], ["id", "id"]);
  assert.deepEqual([...strTokenise(T, "ax")], ["a", "x"]);
  assert.deepEqual([...strTokenise(T, "  ")], []);
});
