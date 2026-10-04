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

// ── Explaining a configuration ────────────────────────────────────────
// Plain data describing one node of the simulation tree, for the explanation shown
// when a node is selected. `chars` is the input as symbols; ctx = { active, onAcceptPath }
// says whether the node is on the current frontier of the stepped simulation and
// whether it lies on a path that accepts. Fields:
//   state, consumed, remaining, stack (top first)
//   arrival: null for the start configuration, else { fromState, fromStack, input, pop, push }
//   role: "initial" | "accepted" | "rejected" | "dead" | "live" | "expanded"
//   why: a sentence on that role; successors: number of children
function pdaExplainConfig(pda, chars, node, ctx = {}) {
  const topFirst = (stack) => [...stack].reverse();
  const stack = topFirst(node.stack);
  const next = chars[node.symDepth];
  const rest = node.symDepth < chars.length;
  const holds = stack.length ? stack.join(" ") : "nothing";
  const emptyStackMode = pda.acceptMode === "empty-stack";

  let role, why;
  if (node.accepted) {
    role = "accepted";
    why = emptyStackMode
      ? "all input is read and the stack is empty, so the string is accepted."
      : `all input is read and ${node.state} is an accepting state, so the string is accepted.`;
  } else if (node.rejected) {
    role = "rejected";
    why = emptyStackMode
      ? `all input is read, but the stack still holds ${holds}.`
      : `all input is read, but ${node.state} is not an accepting state.`;
  } else if (node.dead) {
    role = "dead";
    const top = stack.length ? `${stack[0]} on top of the stack` : "an empty stack";
    why = rest
      ? `no rule applies in ${node.state} when reading ${next} with ${top}, so this branch ends here.` +
        (node.children.length ? " Its ε-moves lead on as separate configurations." : "")
      : "the simulation stopped growing here (the tree size limit was reached).";
  } else if (ctx.active) {
    role = "live";
    why = rest
      ? `one of the configurations the PDA may be in after reading ${node.symDepth} of ${chars.length} symbols; the next symbol is ${next}.`
      : "one of the configurations the PDA may be in after reading all input.";
  } else {
    role = "expanded";
    why = `the PDA has moved on from here, to ${node.children.length} successor${node.children.length === 1 ? "" : "s"} (nondeterministic choices are shown as siblings).`;
  }
  const isRoot = node.parent && node.parent.state === null;
  if (isRoot && role !== "accepted" && role !== "rejected") role = role === "dead" ? "dead" : "initial";

  return {
    state: node.state,
    consumed: chars.slice(0, node.symDepth).join(""),
    remaining: chars.slice(node.symDepth).join(""),
    stack,
    arrival: isRoot || node.edgeInput === null ? null : {
      fromState: node.parent.state, fromStack: topFirst(node.parent.stack),
      input: node.edgeInput, pop: node.edgePop, push: node.edgePush,
    },
    role,
    why,
    successors: node.children.length,
    onAcceptPath: !!ctx.onAcceptPath,
  };
}
