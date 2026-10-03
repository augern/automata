// Pure PDA algorithms: stack operations, the configuration simulation tree, and
// an exact set-based recogniser. No DOM access.
//
// A PDA is { states: string[], start: index, accepts: Set of indices,
//   rules: [{ from, input, pop, to, push }], initStack: string,
//   acceptMode: "final-state" | "empty-stack" }.
// "" in input/pop/push means ε / nothing. A configuration is { state, stack }
// with the top of the stack as the last array element.

const PDA_MAX_CONFIGS = 256;
const PDA_MAX_TREE_NODES = 300;

// Push string: leftmost char becomes the new top, so push chars right-to-left.
function pdaApplyStack(stack, pop, push) {
  const s = [...stack];
  if (pop !== "") s.pop();
  if (push !== "") {
    const chars = [...push];
    for (let i = chars.length - 1; i >= 0; i--) s.push(chars[i]);
  }
  return s;
}

function pdaStackMatch(stack, pop) {
  if (pop === "") return true;
  return stack.length > 0 && stack[stack.length - 1] === pop;
}

// Config key for dedup (state + stack contents)
function pdaCfgKey(c) {
  return c.state + "|" + c.stack.join("\x00");
}

function pdaIsAccepting(pda, c) {
  if (pda.acceptMode === "empty-stack") return c.stack.length === 0;
  return pda.accepts.has(pda.states.indexOf(c.state));
}

function pdaInitialConfig(pda) {
  return { state: pda.states[pda.start], stack: pda.initStack ? [pda.initStack] : [] };
}

// Rules applicable to cfg for the given input ("" = ε-moves), as new configs.
function pdaMoves(pda, cfg, input) {
  const out = [];
  for (const rule of pda.rules) {
    if (rule.from !== cfg.state || rule.input !== input) continue;
    if (!pdaStackMatch(cfg.stack, rule.pop)) continue;
    if (!pda.states.includes(rule.to)) continue;
    out.push({ rule, cfg: { state: rule.to, stack: pdaApplyStack(cfg.stack, rule.pop, rule.push) } });
  }
  return out;
}

// ── Exact recogniser (configuration sets) ─────────────────────────────

function pdaEpsClosure(pda, configs, maxConfigs = PDA_MAX_CONFIGS) {
  const seen = new Map();
  const queue = [];
  for (const c of configs) {
    const k = pdaCfgKey(c);
    if (!seen.has(k)) { seen.set(k, c); queue.push(c); }
  }
  let qi = 0;
  while (qi < queue.length && seen.size < maxConfigs) {
    for (const { cfg } of pdaMoves(pda, queue[qi++], "")) {
      const k = pdaCfgKey(cfg);
      if (!seen.has(k)) { seen.set(k, cfg); queue.push(cfg); }
    }
  }
  return { configs: [...seen.values()], truncated: queue.length > qi || seen.size >= maxConfigs };
}

function pdaSymStep(pda, configs, sym) {
  const result = [];
  const seen = new Set();
  for (const cfg of configs) {
    for (const { cfg: next } of pdaMoves(pda, cfg, sym)) {
      const k = pdaCfgKey(next);
      if (!seen.has(k)) { seen.add(k); result.push(next); }
    }
  }
  return result;
}

// Returns { accepted, truncated }. `truncated` means a closure hit the config
// cap, so a rejection may be wrong (PDAs with ε-pushing loops are unbounded).
function pdaAcceptsString(pda, input, maxConfigs = PDA_MAX_CONFIGS) {
  let truncated = false;
  const close = (cs) => {
    const r = pdaEpsClosure(pda, cs, maxConfigs);
    truncated = truncated || r.truncated;
    return r.configs;
  };
  let configs = close([pdaInitialConfig(pda)]);
  for (const sym of input) configs = close(pdaSymStep(pda, configs, sym));
  return { accepted: configs.some((c) => pdaIsAccepting(pda, c)), truncated };
}

// ── Simulation tree ───────────────────────────────────────────────────
// Each node: { id, state, stack, parent, children[], edgeInput, edgePop,
//   edgePush, symDepth, dead, accepted, rejected }.
// Returns { vRoot, symDepth, frontiers, history, truncated } where
// frontiers[i] = nodes live after consuming i symbols and
// history[i] = the same as plain { state, stack } configs.
// The tree stops growing at maxNodes and may then be incomplete; use
// pdaAcceptsString for a verdict that does not depend on it.

function pdaBuildSimTree(pda, chars, maxNodes = PDA_MAX_TREE_NODES) {
  let nextId = 0;

  function makeNode(state, stack, parent, edgeInput, edgePop, edgePush) {
    const symDepth = edgeInput === null || edgeInput === ""
      ? Math.max(0, parent.symDepth)   // ε-step or root: same symbol depth (vRoot has -1)
      : parent.symDepth + 1;           // symbol-consuming step
    return {
      id: nextId++, state, stack: [...stack],
      parent, children: [],
      edgeInput, edgePop, edgePush, symDepth,
      dead: false, accepted: false, rejected: false,
    };
  }

  // Expand all ε-reachable configs from startNode as tree children.
  // Dedups per expansion to prevent cycles.
  function epsExpand(startNode) {
    const seen = new Set([pdaCfgKey(startNode)]);
    const queue = [startNode];
    let qi = 0;
    while (qi < queue.length && nextId < maxNodes) {
      const par = queue[qi++];
      for (const { rule, cfg } of pdaMoves(pda, par, "")) {
        const k = pdaCfgKey(cfg);
        if (seen.has(k)) continue;
        seen.add(k);
        const child = makeNode(cfg.state, cfg.stack, par, "", rule.pop, rule.push);
        par.children.push(child);
        queue.push(child);
      }
    }
    return queue; // [startNode, ...all ε-descendants]
  }

  // Virtual root (not rendered; holds the real start node as its child)
  const vRoot = { id: nextId++, state: null, stack: [], symDepth: -1, parent: null, children: [] };
  const init = pdaInitialConfig(pda);
  const root = makeNode(init.state, init.stack, vRoot, null, null, null);
  vRoot.children.push(root);

  const frontiers = [];
  const history = [];
  let frontier = epsExpand(root);
  frontiers.push([...frontier]);
  history.push(frontier.map((n) => ({ state: n.state, stack: n.stack })));

  for (const sym of chars) {
    const nextFrontier = [];
    for (const node of frontier) {
      let hadChild = false;
      for (const { rule, cfg } of pdaMoves(pda, node, sym)) {
        if (nextId >= maxNodes) { node.dead = true; break; }
        hadChild = true;
        const child = makeNode(cfg.state, cfg.stack, node, sym, rule.pop, rule.push);
        node.children.push(child);
        for (const n of epsExpand(child)) nextFrontier.push(n);
      }
      if (!hadChild) node.dead = true;
    }
    frontier = nextFrontier;
    frontiers.push([...frontier]);
    history.push(frontier.map((n) => ({ state: n.state, stack: n.stack })));
    if (nextId >= maxNodes) break;
  }

  // Mark terminal nodes
  for (const node of frontier) {
    if (pdaIsAccepting(pda, node)) node.accepted = true;
    else node.rejected = true;
  }

  return { vRoot, symDepth: chars.length, frontiers, history, truncated: nextId >= maxNodes };
}
