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
    const spec = A.ffwSpec(w, { samples: true });
    assert.equal(spec.nodes.length, spec.levels.length + 1, `${where}: a level between neighbouring nodes`);
    const lay = A.ctgSpineLayout(spec);
    assert.ok(Number.isFinite(lay.width) && Number.isFinite(lay.height), where);
    const real = lay.tokens.filter((t) => !t.eps && t.text !== "$");
    // the base line reads as the witness's sentence
    assert.equal(real.map((t) => t.text).join(" "), A.ffwTokens(w.tree).join(" "), `${where}: the sentence`);
    // without samples, only the incidental strings change, and they become a faded …
    const bare = A.ctgSpineLayout(A.ffwSpec(w));
    assert.equal(bare.tokens.length, lay.tokens.length, `${where}: same cells`);
    bare.tokens.forEach((t, i) => {
      if (t.text !== lay.tokens[i].text) assert.ok(t.cls === "is-dim" ? t.text === "…" : t.head === lay.tokens[i].head || t.text.endsWith("…"), `${where}: incidental strings only`);
      if (t.text !== lay.tokens[i].text) assert.ok(t.tip || t.text.endsWith("…"), `${where}: sample as tooltip`);
    });
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
  assert.deepEqual(js(spec.nodes.map((n) => n.sym)), ["E", "T", "F"], "terminals are leaves, not nodes");
  assert.deepEqual(js(spec.levels.map((l) => [l.left, l.right && l.right.map((f) => f.text + ":" + f.label)])), [[null, ["ε:E'"]], [null, ["ε:T'"]]]);
  assert.deepEqual(js(spec.bottom.map((c) => c.text)), ["id"]);
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
  const forms = (alt) => JSON.stringify(A.ffwSpec(A.ffwFirst(g, rec, "S", "c", alt)).nodes.map((n) => n.sym));
  assert.equal(A.ffwFirst(g, rec, "S", "c").count, 2);
  assert.notEqual(forms(0), forms(1));
});

test("the general case: a figure for nullable, FIRST and FOLLOW that reads as the definition says", () => {
  for (const kind of ["first", "follow"]) {
    assert.equal(A.ffwTheory(kind).cases.length, 2, `${kind}: the member and the special case of the definition`);
    const spec = A.ffwTheory(kind).cases[0];
    assert.equal(spec.nodes.length, spec.levels.length + 1, kind);
    const lay = A.ctgSpineLayout(spec);
    assert.ok(Number.isFinite(lay.width) && Number.isFinite(lay.height), kind);
    if (kind === "first") {
      assert.equal(lay.tokens.find((t) => !t.eps).text, "a", "the first token seen from the left");
    }
    const special = A.ctgSpineLayout(A.ffwTheory(kind).cases[1]);
    assert.ok(special.tokens.some((t) => t.id === "t" || t.mark), `${kind}: the special case marks its member`);
    if (kind === "follow") {
      assert.ok(special.tokens.some((t) => t.text === "$" && t.id === "t"), "$ after the whole string");
      const bottom = lay.tokens.find((t) => Math.abs(t.x + t.w / 2 - lay.cx) < 1e-6);
      const next = lay.tokens.filter((t) => t.x > bottom.x && !t.eps)[0];
      assert.equal(next.id, "t");
      assert.equal(next.text.split(" ")[0], "a", "what follows B starts with a");
    }
  }
});

test("jagged edges: a figure of the general case has them everywhere, a witness has none (every step is a rule)", () => {
  for (const kind of ["first", "follow"]) {
    for (const spec of A.ffwTheory(kind).cases) {
      assert.ok(spec.nodes.slice(1).every((n) => n.jag === true), `${kind}: every edge of the general case is jagged`);
      assert.ok(A.ctgSpineLayout(spec).jags.every((j) => j.jag));
    }
  }
  const g = A.parseBNF("E -> T E'\nE' -> + T E' | eps\nT -> F T'\nT' -> * F T' | eps\nF -> ( E ) | id", false);
  const rec = A.ffRecord(g);
  for (const spec of [A.ffwSpec(A.ffwFirst(g, rec, "E", "id")), A.ffwSpec(A.ffwFollow(g, rec, "T", ")")), A.ffwSpec(A.ffwNullable(g, rec, "E'"))]) {
    assert.ok(spec.nodes.slice(1).every((n) => n.jag === false));
  }
});

test("a nullable witness: the root bare over a node with a small triangle for each symbol of its rule, jagged where it derives ε through others", () => {
  const g = A.parseBNF("S -> A A\nA -> B B\nB -> C C\nC -> c | eps", false);
  const rec = A.ffRecord(g);
  const spec = A.ffwSpec(A.ffwNullable(g, rec, "S"));
  assert.deepEqual(js(spec.nodes.map((n) => n.sym)), ["S"], "only the root is on the spine");
  assert.deepEqual(js(spec.bottom.map((b) => [b.text, b.node.sym, b.node.jag])), [["ε", "A", true], ["ε", "A", true]], "each A derives ε through other symbols");
  const lay = A.ctgSpineLayout(spec);
  assert.equal(lay.tris[0].hidden, true);
  assert.equal(lay.subs.length, 2);
  // direct and indirect side by side: B → ε is one step, A → B B is not
  const g2 = A.parseBNF("S -> A B\nA -> B B\nB -> eps", false);
  const spec2 = A.ffwSpec(A.ffwNullable(g2, A.ffRecord(g2), "S"));
  assert.deepEqual(js(spec2.bottom.map((b) => [b.node.sym, b.node.jag])), [["A", true], ["B", false]]);
  // a symbol with an empty rule of its own: the one triangle over its ε
  const direct = A.ffwSpec(A.ffwNullable(g2, A.ffRecord(g2), "B"));
  assert.deepEqual(js([direct.nodes.length, direct.bottom.text, direct.bottom.label]), [1, "ε", "B → ε"]);
});

test("the line down to the string: jagged where the lowest node derives it in more than one rule step", () => {
  const g1 = A.parseBNF("S -> A b | c\nA -> a", false);
  const rec = A.ffRecord(g1);
  assert.equal(A.ffwSpec(A.ffwFollow(g1, rec, "A", "b")).terminus, false, "A → a: one step");
  assert.equal(A.ffwSpec(A.ffwFollow(g1, rec, "S", "$")).terminus, false, "S → c: one step");
  const g2 = A.parseBNF("S -> A b\nA -> B\nB -> a", false);
  assert.equal(A.ffwSpec(A.ffwFollow(g2, A.ffRecord(g2), "A", "b")).terminus, true, "A → B → a: more than one");
  assert.ok(A.ctgSpineLayout(A.ffwSpec(A.ffwFollow(g2, A.ffRecord(g2), "A", "b"))).ends.length === 1);
  assert.equal(A.ctgSpineLayout(A.ffwSpec(A.ffwFollow(g1, rec, "A", "b"))).ends.length, 0);
  const indirect = A.ctgSpineLayout(A.ffwTheory("nullable").figures[1]);
  assert.ok(indirect.span && indirect.span.mark.label === "A derives ε", "one staple and the marker under the whole base line");
  assert.ok(Math.abs(indirect.span.x0 - indirect.base[0].x0) < 1e-9 && Math.abs(indirect.span.x1 - indirect.base[0].x1) < 1e-9);
  assert.equal(A.ffwTheory("follow").cases[0].terminus, true, "A derives x in any number of steps");
});

test("the general case: a string that is not spelled out is a faded … with its name as the label, never the name on the base line", () => {
  for (const kind of ["first", "follow"]) {
    const lay = A.ctgSpineLayout(A.ffwTheory(kind).cases[0]);
    for (const tok of lay.tokens) assert.ok(["ε", "a", "…", "a …"].includes(tok.text), `${kind}: ${tok.text} on the base line`);
    const unspelled = lay.tokens.filter((t) => t.text === "…");
    assert.ok(unspelled.length >= 1 && unspelled.every((t) => (["β", "A"].includes(t.label) || (t.label === "" && /^(?:α|)$/.test(t.group))) && t.cls === "is-dim"), `${kind}: the names are below`);
  }
  const follow = A.ctgSpineLayout(A.ffwTheory("follow").cases[0]);
  assert.equal(follow.tokens.find((t) => t.id === "t").head, "a", "the token that follows is spelled, the rest of its string is not");
});

test("the general case of nullable: two figures, directly and through other symbols, the symbols drawn as nodes of their own", () => {
  const theory = A.ffwTheory("nullable");
  assert.equal(theory.figures.length, 2);
  const [direct, indirect] = theory.figures.map((f) => A.ctgSpineLayout(f));
  assert.deepEqual(js([direct.caption, indirect.caption]), ["directly", "through other symbols"]);
  assert.deepEqual(js(direct.tokens.map((t) => [t.text, t.label])), [["ε", "A → ε"]]);
  assert.equal(direct.subs.length, 0, "directly: nothing between A and ε");
  // through other symbols: a node and a small triangle for each symbol, none singled out; the faded … stands for the ones between
  assert.deepEqual(js(indirect.tokens.map((t) => t.text)), ["ε", "ε", "…", "ε"]);
  assert.deepEqual(js(indirect.subs.map((s) => s.sym)), ["X₁", "X₂", "Xₙ"]);
  assert.ok(indirect.subs.every((s) => s.jag), "each derives ε in any number of steps: a jagged edge down to the ε");
  assert.equal(new Set(indirect.subs.map((s) => s.share)).size, 1, "all of them alike");
  assert.equal(indirect.nodes.length, 1, "A is the only node on the spine: no path through one of the symbols");
  assert.equal(indirect.tris[0].hidden, true, "A has no triangle of its own: its children cover all of it");
  assert.ok(!direct.tris[0].hidden, "directly, A's triangle is all there is");
  const parent = indirect.tris[0];
  indirect.subs.forEach((sub, k) => {
    assert.ok(sub.x0 >= parent.x0 - 1e-9 && sub.x1 <= parent.x1 + 1e-9, "the small triangle is under A's base");
    assert.ok(sub.ay > parent.ay, "and below its apex");
    if (k) assert.ok(sub.x0 >= indirect.subs[k - 1].x1 - 1e-9, "the small triangles do not overlap");
    const e = indirect.tokens.find((t) => t.x <= sub.x && sub.x <= t.x + t.w);
    assert.equal(e.text, "ε", "each stands over an ε");
  });
  for (const lay of [direct, indirect]) for (let k = 1; k < lay.tokens.length; k++) assert.ok(lay.tokens[k].x >= lay.tokens[k - 1].x + lay.tokens[k - 1].w - 1e-9, "no overlap");
});

test("captions widen a figure only when they are wider than it", () => {
  const spec = { nodes: [{ sym: "A" }], levels: [], bottom: { text: "ε" } };
  const plain = A.ctgSpineLayout(spec), captioned = A.ctgSpineLayout({ ...spec, caption: "a rather long caption above the figure" });
  assert.ok(captioned.width > plain.width && captioned.caption.length > 0);
  assert.equal(A.ctgSpineLayout({ ...spec, caption: "x" }).width, plain.width);
});

test("unit-rule chains are one jagged edge", () => {
  const g = A.parseBNF("S -> A\nA -> B\nB -> C\nC -> a", false);
  const spec = A.ffwSpec(A.ffwFirst(g, A.ffRecord(g), "S", "a", 0));
  assert.deepEqual(js(spec.nodes.map((n) => [n.sym, n.jag])), [["S", false], ["C", true]]);
  assert.equal(spec.levels.length, 1);
});
