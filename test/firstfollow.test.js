const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const A = load("grammar.js", "ll1.js", "firstfollow.js");
const plain = (set) => [...set].sort();
const js = (x) => JSON.parse(JSON.stringify(x)); // arrays from the vm context have another prototype

const GRAMMARS = [
  "E -> T E'\nE' -> + T E' | eps\nT -> F T'\nT' -> * F T' | eps\nF -> ( E ) | id",
  "S -> A B C\nA -> a | eps\nB -> b | eps\nC -> c | eps",
  "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id",
  "S -> A A\nA -> B B\nB -> C C\nC -> eps | c",
  "S -> a S | A1\nA1 -> A2 A2\nA2 -> eps",
];

test("the recorded iteration ends with the sets of computeFirst and computeFollow", () => {
  for (const text of GRAMMARS) {
    const g = A.parseBNF(text, false);
    const rec = A.ffRecord(g);
    const first = A.computeFirst(g), follow = A.computeFollow(g, first);
    for (const nt of g.nonterminals) {
      assert.deepEqual(plain(rec.first[nt]), plain(first[nt]).filter((t) => t !== A.EPSILON), `FIRST(${nt}) in ${text}`);
      assert.equal(rec.nullable.has(nt), first[nt].has(A.EPSILON), `nullable(${nt})`);
      assert.deepEqual(plain(rec.follow[nt]), plain(follow[nt]), `FOLLOW(${nt})`);
    }
  }
});

test("rounds: each phase ends with a round that adds nothing, and events are numbered in order", () => {
  const g = A.parseBNF(GRAMMARS[0], false);
  const rec = A.ffRecord(g);
  for (const phase of ["nullable", "first", "follow"]) {
    const rs = rec.rounds.filter((r) => r.phase === phase);
    assert.equal(rs[rs.length - 1].added, 0, phase);
    assert.ok(rs.slice(0, -1).every((r) => r.round === 0 || r.added > 0), phase);
  }
  let at = 0;
  for (const r of rec.rounds) { assert.equal(r.from, at); at = r.to; }
  assert.equal(at, rec.events.length);
});

test("the seed puts $ into FOLLOW of the start symbol in round 0", () => {
  const g = A.parseBNF(GRAMMARS[0], false);
  const rec = A.ffRecord(g);
  const seed = rec.events.find((e) => e.phase === "follow");
  assert.deepEqual(js([seed.round, seed.rule, seed.target, seed.added]), [0, -1, "E", ["$"]]);
});

test("a chain of nullable symbols needs one nullable round per level when the rules come in top-down order", () => {
  const g = A.parseBNF("S -> A A\nA -> B B\nB -> C C\nC -> eps | c", false);
  const rec = A.ffRecord(g);
  const rs = rec.rounds.filter((r) => r.phase === "nullable");
  assert.deepEqual(js(rs.map((r) => r.added)), [1, 1, 1, 1, 0]);
  assert.deepEqual(plain(rec.nullable), ["A", "B", "C", "S"]);
});

test("FOLLOW reads past nullable symbols and flows FOLLOW of the left side in at the end", () => {
  const g = A.parseBNF("S -> A B C\nA -> a\nB -> b | eps\nC -> c | eps", false);
  const rec = A.ffRecord(g);
  const ofA = rec.events.find((e) => e.phase === "follow" && e.round === 1 && e.rule === 0 && e.target === "A");
  assert.deepEqual(js(ofA.cells.map((c) => c.state)), ["pass", "pass"]);
  assert.equal(ofA.end, true);
  assert.deepEqual(js(ofA.viaFollow), ["$"]);
  assert.deepEqual(plain(rec.follow.A), ["$", "b", "c"]);
  const ofC = rec.events.find((e) => e.phase === "follow" && e.round === 1 && e.rule === 0 && e.target === "C");
  assert.deepEqual(js([ofC.cells, ofC.end, ofC.added, ofC.viaFollow]), [[], true, ["$"], ["$"]]);
});

test("ffStateAt replays the events and records the event behind each member", () => {
  const g = A.parseBNF(GRAMMARS[0], false);
  const rec = A.ffRecord(g);
  const none = A.ffStateAt(g, rec, -1);
  assert.equal(none.nullable.size, 0);
  const all = A.ffStateAt(g, rec, rec.events.length - 1);
  assert.deepEqual(plain(all.first.E), plain(rec.first.E));
  for (const t of all.follow.F) assert.ok(rec.events[all.by.follow.F[t]].added.includes(t));
  assert.ok(rec.events[all.by.nullable["E'"]].added.includes("E'"));
});

test("ffScan stops at the first symbol that is not nullable and leaves the rest unread", () => {
  const g = A.parseBNF(GRAMMARS[1], false);
  const rec = A.ffRecord(g);
  const sc = A.ffScan(["A", "x", "B"], g.nonterminals, rec.nullable, rec.first, true);
  assert.deepEqual(js(sc.cells.map((c) => c.state)), ["pass", "stop", "unread"]);
  assert.deepEqual(js(sc.toks), ["a", "x"]);
  assert.equal(sc.end, false);
  assert.equal(A.ffScan([], g.nonterminals, rec.nullable, rec.first, true).end, true);
});

test("ffExplain gives a sentence for every event", () => {
  for (const text of GRAMMARS) {
    const g = A.parseBNF(text, false);
    for (const ev of A.ffRecord(g).events) assert.ok(A.ffExplain(g, ev).length > 10);
  }
});
