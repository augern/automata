const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");

const A = load("grammar.js", "ll1.js", "firstfollow.js", "ctg.js", "ffwitness.js");
const js = (x) => JSON.parse(JSON.stringify(x));

// Every node that is one rule application has the symbols of one of the grammar's rules as its kids.
function assertConforms(g, node, label) {
  if (!node.abstract) {
    const kids = node.kids.map((k) => (typeof k === "string" ? k : k.text !== undefined ? k.text : k.sym));
    const ok = g.rules.some((r) => r.lhs === node.sym && r.rhs.length === kids.length && r.rhs.every((s, i) => s === kids[i]));
    assert.ok(ok, `${label}: ${node.sym} → ${kids.join(" ")} is not a rule`);
  } else {
    const y = A.ffwShortest(g)[node.sym];
    const text = node.kids.map((k) => (typeof k === "string" ? k : k.text));
    assert.deepEqual(js(text), js(y || ["…"]), `${label}: ${node.sym} abstract`);
  }
  for (const k of node.kids) if (typeof k !== "string" && k.text === undefined) assertConforms(g, k, label);
}

function checkAll(g, label) {
  const rec = A.ffRecord(g);
  for (const nt of g.nonterminals) {
    if (rec.nullable.has(nt)) {
      const w = A.ffwNullable(g, rec, nt);
      assertConforms(g, w.tree, `${label} nullable ${nt}`);
      assert.equal(A.ctgLayout(w.tree).leaves.length, 0, `${label}: ${nt} nullable has no tokens`);
    } else assert.equal(A.ffwNullable(g, rec, nt), null);
    for (const t of rec.first[nt]) {
      const w = A.ffwFirst(g, rec, nt, t);
      const lay = A.ctgLayout(w.tree);
      assert.equal(w.tree.sym, nt);
      assert.equal(lay.leafById.t, 0, `${label}: FIRST(${nt}) ∋ ${t}: the token comes first`);
      assert.equal(lay.leaves[0].text, t);
      assertConforms(g, w.tree, `${label} FIRST(${nt}) ∋ ${t}`);
    }
    for (const t of rec.follow[nt]) {
      const w = A.ffwFollow(g, rec, nt, t);
      const lay = A.ctgLayout(w.tree, { endMarker: w.endMarker });
      const at = lay.leafById[t === "$" ? "end" : "t"];
      assert.ok(at !== undefined, `${label}: FOLLOW(${nt}) ∋ ${t}: has the token`);
      assert.equal(lay.leaves[at].text, t);
      assert.equal(A.ctgNextLeaf(lay, "target"), at, `${label}: FOLLOW(${nt}) ∋ ${t}: the token follows the symbol`);
      if (!w.unreachable) assert.equal(w.tree.sym, g.start, `${label}: rooted at the start symbol`);
      assertConforms(g, w.tree, `${label} FOLLOW(${nt}) ∋ ${t}`);
    }
    assert.equal(A.ffwFirst(g, rec, nt, "no-such-token"), null);
    assert.equal(A.ffwFollow(g, rec, nt, "no-such-token"), null);
  }
}

test("shortest strings: the shortest derivation of each nonterminal, null for an unproductive one", () => {
  const g = A.parseBNF("S -> A B\nA -> a A | b\nB -> c | B c\nU -> U u", false);
  const sh = A.ffwShortest(g);
  assert.deepEqual(js(sh.S), ["b", "c"]);
  assert.deepEqual(js(sh.A), ["b"]);
  assert.equal(sh.U, null);
});

test("witnesses conform to the grammar and show their token, for every set member of the examples", () => {
  const dir = path.join(__dirname, "..", "tools", "firstfollow");
  const lib = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "shared", "grammars.json"), "utf8"));
  const data = JSON.parse(fs.readFileSync(path.join(dir, "examples.json"), "utf8"));
  for (const grp of data.groups) for (const ex of grp.examples) {
    const text = (ex.grammar ? lib[ex.grammar].text : ex.text).join("\n");
    checkAll(A.parseBNF(text, false), ex.label);
  }
});

test("witnesses for random grammars", () => {
  let seed = 7;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) >> 8) % n;
  for (let k = 0; k < 400; k++) {
    const nts = ["S", "A", "B", "C"].slice(0, 2 + rnd(3));
    const syms = [...nts, "a", "b", "c"];
    const lines = nts.map((nt) => nt + " -> " + Array.from({ length: 1 + rnd(3) }, () => (rnd(4) === 0 ? "eps" : Array.from({ length: 1 + rnd(3) }, () => syms[rnd(syms.length)]).join(" "))).join(" | "));
    checkAll(A.parseBNF(lines.join("\n"), false), lines.join(" ; "));
  }
});

test("a witness of FOLLOW through a nullable symbol shows the symbol as a point and the token next to the string", () => {
  const g = A.parseBNF("S -> A N b\nA -> a\nN -> eps", false);
  const rec = A.ffRecord(g);
  const w = A.ffwFollow(g, rec, "A", "b");
  const lay = A.ctgLayout(w.tree);
  const n = lay.nodes.find((x) => x.sym === "N");
  assert.equal(n.point, true);
  assert.equal(A.ctgNextLeaf(lay, "target"), lay.leafById.t);
});

// The witnesses as spine figures: what the figure shows is what the member says.
function checkSpecs(g, label) {
  const rec = A.ffRecord(g);
  const figure = (w, where) => {
    const spec = A.ffwSpec(w);
    assert.equal(spec.nodes.length, spec.levels.length + 1, `${where}: a level between neighbouring nodes`);
    const lay = A.ctgSpineLayout(spec);
    assert.ok(Number.isFinite(lay.width) && Number.isFinite(lay.height), where);
    const real = lay.tokens.filter((t) => !t.eps && t.text !== "$");
    // the base line reads as the witness's sentence
    assert.equal(real.map((t) => t.text).join(" "), A.ffwTokens(w.tree).join(" "), `${where}: the sentence`);
    return { spec, lay };
  };
  // every way of showing a member, not only the first
  const each = (make, where, check) => {
    const first = make(0);
    assert.ok(first && first.count >= 1, `${where}: a witness`);
    for (let alt = 0; alt < first.count; alt++) {
      const w = make(alt);
      assert.equal(w.alt, alt);
      check(w, `${where} (way ${alt + 1} of ${first.count})`);
    }
  };
  for (const nt of g.nonterminals) {
    if (rec.nullable.has(nt)) {
      each((alt) => A.ffwNullable(g, rec, nt, alt), `${label}: nullable ${nt}`, (w, where) => {
        const { lay } = figure(w, where);
        assert.ok(lay.tokens.every((t) => t.eps), `${where}: only ε`);
      });
    }
    for (const t of rec.first[nt]) {
      each((alt) => A.ffwFirst(g, rec, nt, t, alt), `${label}: FIRST(${nt}) ∋ ${t}`, (w, where) => {
        const { spec, lay } = figure(w, where);
        const seen = lay.tokens.find((k) => !k.eps);
        assert.equal(seen.text, t, `${where}: the first token seen from the left`);
        assert.equal(seen.id, "t");
        assert.equal(seen.kind, "first");
        assert.equal(spec.nodes[0].sym, nt);
        assert.ok(lay.arrows.length === 1 && lay.arrows[0].side === "left" && Math.abs(lay.arrows[0].x0 - lay.nodes[0].footL) < 1e-9, `${where}: from the left foot`);
      });
    }
    for (const t of rec.follow[nt]) {
      each((alt) => A.ffwFollow(g, rec, nt, t, alt), `${label}: FOLLOW(${nt}) ∋ ${t}`, (w, where) => {
        const { spec, lay } = figure(w, where);
        const bottom = lay.tokens.find((k) => Math.abs(k.x + k.w / 2 - lay.cx) < 1e-6);
        const after = lay.tokens.filter((k) => k.x > bottom.x && !k.eps);
        assert.ok(after.length > 0, `${where}: something follows`);
        assert.equal(after[0].id, "t", `${where}: the next token`);
        assert.ok(t === "$" ? after[0].text === "$" : after[0].text.split(" ")[0] === t, `${where}: ${after[0].text}`);
        assert.equal(after[0].kind, "follow");
        const arrow = lay.arrows[0];
        assert.ok(arrow.side === "right" && Math.abs(arrow.x0 - lay.nodes[lay.nodes.length - 1].footR) < 1e-9, `${where}: from the right foot of the symbol`);
        assert.ok(spec.nodes[spec.nodes.length - 1].sym === nt, `${where}: the path ends at the symbol`);
      });
    }
  }
}

test("witness specs: the figures of the examples read as their members say", () => {
  const dir = path.join(__dirname, "..", "tools", "firstfollow");
  const lib = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "shared", "grammars.json"), "utf8"));
  const data = JSON.parse(fs.readFileSync(path.join(dir, "examples.json"), "utf8"));
  for (const grp of data.groups) for (const ex of grp.examples) {
    const text = (ex.grammar ? lib[ex.grammar].text : ex.text).join("\n");
    checkSpecs(A.parseBNF(text, false), ex.label);
  }
});

test("witness specs for random grammars", () => {
  let seed = 23;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) >> 8) % n;
  for (let k = 0; k < 250; k++) {
    const nts = ["S", "A", "B", "C"].slice(0, 2 + rnd(3));
    const syms = [...nts, "a", "b", "c"];
    const lines = nts.map((nt) => nt + " -> " + Array.from({ length: 1 + rnd(3) }, () => (rnd(4) === 0 ? "eps" : Array.from({ length: 1 + rnd(3) }, () => syms[rnd(syms.length)]).join(" "))).join(" | "));
    const g = A.parseBNF(lines.join("\n"), false);
    // unproductive symbols have no string to show: leave out the grammars that have one
    if (Object.values(A.ffwShortest(g)).some((y) => y === null)) continue;
    checkSpecs(g, lines.join(" ; "));
  }
});

test("witness specs: FIRST(E) of the expression grammar: the path E, T, F, id with E′ and T′ vanishing", () => {
  const g = A.parseBNF("E -> T E'\nE' -> + T E' | eps\nT -> F T'\nT' -> * F T' | eps\nF -> ( E ) | id", false);
  const rec = A.ffRecord(g);
  const spec = A.ffwSpec(A.ffwFirst(g, rec, "E", "id"));
  assert.deepEqual(js(spec.nodes.map((n) => n.sym)), ["E", "T", "F", "id"]);
  assert.deepEqual(js(spec.levels.map((l) => [l.left, l.right && l.right.map((f) => f.text + ":" + f.label)])), [[null, ["ε:E'"]], [null, ["ε:T'"]], [null, null]]);
});

test("witness specs: the derivation along the path and the sentence", () => {
  const g = A.parseBNF("E -> T E'\nE' -> + T E' | eps\nT -> F T'\nT' -> * F T' | eps\nF -> ( E ) | id", false);
  const rec = A.ffRecord(g);
  const first = A.ffwSpec(A.ffwFirst(g, rec, "E", "id"));
  assert.deepEqual(js(first.forms), ["E", "T E'", "F T' E'", "id T' E'"]);
  assert.equal(first.statement, "id ∈ FIRST(E): E can derive a string that starts with id");
  const follow = A.ffwSpec(A.ffwFollow(g, rec, "T", ")"));
  assert.equal(follow.forms[0], "E");
  assert.ok(follow.forms[follow.forms.length - 1].split(" ").includes("T"), "the last form has the symbol");
  assert.match(follow.statement, /^\) ∈ FOLLOW\(T\): .*can be followed by \)/);
  const end = A.ffwSpec(A.ffwFollow(g, rec, "E", "$"));
  assert.match(end.statement, /can be the last thing/);
  const nul = A.ffwSpec(A.ffwNullable(g, rec, "E'"));
  assert.deepEqual(js(nul.forms), ["E'", "ε"]);
  assert.equal(nul.statement, "E' is nullable: E' can derive the empty string");
});

test("witness specs: every form follows from the one before by one rule", () => {
  const g = A.parseBNF("S -> A B C d\nA -> a | eps\nB -> b | eps\nC -> c | eps", false);
  const rec = A.ffRecord(g);
  const split = (f) => (f === "ε" ? [] : f.split(" "));
  // one symbol of the earlier form is replaced by the right-hand side of one of its rules
  const steps = (before, after) => before.some((sym, i) => g.rules.some((r) => r.lhs === sym &&
    JSON.stringify([...before.slice(0, i), ...r.rhs, ...before.slice(i + 1)]) === JSON.stringify(after)));
  for (const nt of g.nonterminals) for (const kind of ["first", "follow"]) for (const t of rec[kind][nt]) {
    const spec = A.ffwSpec(kind === "first" ? A.ffwFirst(g, rec, nt, t) : A.ffwFollow(g, rec, nt, t));
    for (let k = 1; k < spec.forms.length; k++) assert.ok(steps(split(spec.forms[k - 1]), split(spec.forms[k])), `${kind}(${nt}) ∋ ${t}: ${spec.forms[k - 1]} ⇒ ${spec.forms[k]}`);
  }
});

test("ways of showing a member: the fewest nodes first, a left recursion does not loop", () => {
  const g = A.parseBNF("S -> S b b | eps | a S | b", false);
  const rec = A.ffRecord(g);
  const w = A.ffwFirst(g, rec, "S", "b", 0);
  assert.ok(w.count >= 2, "several ways");
  const sizes = Array.from({ length: w.count }, (_, alt) => A.ffwSize(A.ffwFirst(g, rec, "S", "b", alt).tree));
  assert.deepEqual(js(sizes), js([...sizes].sort((x, y) => x - y)), "the shortest first");
  assert.equal(A.ffwFirst(g, rec, "S", "b", w.count).alt, 0, "the ways go round");
  assert.ok(A.ffwFollow(g, rec, "S", "b").count >= 1);
});

test("ways of showing a member: the different ways are different derivations", () => {
  const g = A.parseBNF("S -> A a | B b\nA -> c\nB -> c", false);
  const rec = A.ffRecord(g);
  const forms = (alt) => JSON.stringify(A.ffwSpec(A.ffwFirst(g, rec, "S", "c", alt)).forms);
  assert.equal(A.ffwFirst(g, rec, "S", "c").count, 2);
  assert.notEqual(forms(0), forms(1));
});

test("the general case: a figure for nullable, FIRST and FOLLOW that reads as the definition says", () => {
  for (const kind of ["nullable", "first", "follow"]) {
    const spec = A.ffwTheory(kind);
    assert.equal(spec.nodes.length, spec.levels.length + 1, kind);
    const lay = A.ctgSpineLayout(spec);
    assert.ok(Number.isFinite(lay.width) && Number.isFinite(lay.height), kind);
    assert.ok(spec.statement.length > 20 && spec.forms.length >= 2, kind);
    if (kind === "nullable") assert.ok(lay.tokens.every((t) => t.eps));
    if (kind === "first") {
      assert.equal(lay.tokens.find((t) => !t.eps).text, "a", "the first token seen from the left");
      assert.ok(lay.arrows[0].side === "left" && Math.abs(lay.arrows[0].x0 - lay.nodes[0].footL) < 1e-9);
    }
    if (kind === "follow") {
      const bottom = lay.tokens.find((t) => Math.abs(t.x + t.w / 2 - lay.cx) < 1e-6);
      const next = lay.tokens.filter((t) => t.x > bottom.x && !t.eps)[0];
      assert.equal(next.id, "t");
      assert.equal(next.text.split(" ")[0], "a", "what follows B starts with a");
      assert.ok(Math.abs(lay.arrows[0].x0 - lay.nodes[2].footR) < 1e-9, "from the right foot of B");
    }
  }
});

test("jagged edges: a figure of the general case has them everywhere, a witness has none (every step is a rule)", () => {
  for (const kind of ["first", "follow"]) {
    const spec = A.ffwTheory(kind);
    assert.ok(spec.nodes.slice(1).every((n) => n.jag === true), `${kind}: every edge of the general case is jagged`);
    assert.ok(A.ctgSpineLayout(spec).jags.every((j) => j.jag));
  }
  const g = A.parseBNF("E -> T E'\nE' -> + T E' | eps\nT -> F T'\nT' -> * F T' | eps\nF -> ( E ) | id", false);
  const rec = A.ffRecord(g);
  for (const spec of [A.ffwSpec(A.ffwFirst(g, rec, "E", "id")), A.ffwSpec(A.ffwFollow(g, rec, "T", ")")), A.ffwSpec(A.ffwNullable(g, rec, "E'"))]) {
    assert.ok(spec.nodes.slice(1).every((n) => n.jag === false));
  }
});
