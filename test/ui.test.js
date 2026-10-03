const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// ui.js needs esc() (grammar.js) and a document; give it a tiny fake one.
function makeUI() {
  const cells = [];
  const elements = {};
  const el = (id) => (elements[id] ||= { id, textContent: "", innerHTML: "", className: "" });
  const document = {
    getElementById: el,
    querySelectorAll: (sel) => (sel === ".ui-td--state" ? cells : []),
  };
  const ctx = vm.createContext({ document });
  for (const f of ["algo/grammar.js", "ui.js"]) {
    const file = path.join(__dirname, "..", "shared", f);
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  }
  const UI = vm.runInContext("UI", ctx);
  const makeCell = () => {
    const classes = new Set(["ui-td--state"]);
    return { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) }, classes };
  };
  return { UI, el, cells, makeCell };
}

test("banner: show sets kind class and text; hide resets", () => {
  const { UI, el } = makeUI();
  const b = UI.banner("v");
  b.show("accept", "✓  ACCEPTED");
  assert.equal(el("v").textContent, "✓  ACCEPTED");
  assert.equal(el("v").className, "ui-result ui-result--accept is-visible");
  b.show("warn", "⚠");
  assert.equal(el("v").className, "ui-result ui-result--warn is-visible");
  b.hide();
  assert.equal(el("v").className, "ui-result");
  assert.equal(el("v").textContent, "");
});

test("logBar: set and clear", () => {
  const { UI, el } = makeUI();
  const log = UI.logBar("l");
  log.set("<b>x</b>");
  assert.equal(el("l").innerHTML, "<b>x</b>");
  log.set();
  assert.equal(el("l").innerHTML, "");
  log.set("y");
  log.clear();
  assert.equal(el("l").innerHTML, "");
});

test("table.state escapes the state name", () => {
  const { UI } = makeUI();
  const html = UI.table.state('<img src=x onerror="alert(1)">', "start");
  assert.ok(!html.includes("<img"), html);
  assert.match(html, /^<td class="ui-td--state is-start">&lt;img/);
});

test("table.input escapes the value but passes attrs through", () => {
  const { UI } = makeUI();
  const html = UI.table.input('"><script>x</script>', 'data-state="q0"', { muted: true, size: "wide", invalid: true });
  assert.ok(!html.includes("<script>"), html);
  assert.match(html, /<td class="ui-td--input is-muted">/);
  assert.match(html, /class="ui-cell ui-cell--wide invalid"/);
  assert.match(html, /data-state="q0"/);
});

test("table.th and rm escape titles; th options become classes", () => {
  const { UI } = makeUI();
  assert.equal(UI.table.th("→", { title: 'Start "state"' }), '<th title="Start &quot;state&quot;">→</th>');
  assert.match(UI.table.th("a", { sym: true, wide: true, muted: true, left: true, tone: "accept" }), /class="ui-th--sym ui-th--wide ui-th--muted ui-th--left ui-th--accept"/);
  const rm = UI.table.rm("removeState(2)", `Remove 'q"2'`);
  assert.match(rm, /onclick="removeState\(2\)"/);
  assert.match(rm, /title="Remove &#39;q&quot;2&#39;"|title="Remove 'q&quot;2'"/);
});

test("table.kind picks the state-name colour", () => {
  const { UI } = makeUI();
  assert.equal(UI.table.kind(false, false), "");
  assert.equal(UI.table.kind(true, false), "start");
  assert.equal(UI.table.kind(false, true), "accept");
  assert.equal(UI.table.kind(true, true), "both");
  assert.equal(UI.table.kind(true, true, true), "reject");
  assert.equal(UI.table.kind(false, false, true), "reject");
});

test("table.refreshStates updates the is-* class of each state cell", () => {
  const { UI, cells, makeCell } = makeUI();
  cells.push(makeCell(), makeCell(), makeCell());
  const kinds = ["start", "", "accept"];
  UI.table.refreshStates((i) => kinds[i]);
  assert.deepEqual([...cells[0].classes].sort(), ["is-start", "ui-td--state"]);
  assert.deepEqual([...cells[1].classes], ["ui-td--state"]);
  assert.deepEqual([...cells[2].classes].sort(), ["is-accept", "ui-td--state"]);
  UI.table.refreshStates(() => "reject");
  assert.ok(cells.every((c) => c.classes.has("is-reject") && !c.classes.has("is-start") && !c.classes.has("is-accept")));
});

test("table.open and cell", () => {
  const { UI } = makeUI();
  assert.equal(UI.table.open(), '<table class="ui-table">');
  assert.equal(UI.table.open("extra"), '<table class="ui-table extra">');
  assert.equal(UI.table.cell("→"), '<td class="ui-td--static">→</td>');
});
