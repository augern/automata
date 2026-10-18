// Pure NFA algorithms: ε-closure and the nondeterministic simulation tree.
// No DOM access. An NFA is { states: string[], start: index into states,
// accepts: Set of indices into states, trans: { [state]: { [symbol]: string[] } } }
// where the symbol "ε" labels ε-moves.

// Exact acceptance by simulating the set of active states.
function nfaAcceptsString(nfa, inputStr) {
  let active = nfaEpsClosure(nfa, [nfa.states[nfa.start]]);
  for (const sym of inputStr) {
    const next = new Set();
    for (const s of active) for (const t of nfa.trans[s]?.[sym] || []) next.add(t);
    active = nfaEpsClosure(nfa, [...next]);
  }
  return [...active].some((s) => nfa.accepts.has(nfa.states.indexOf(s)));
}

function nfaEpsClosure(nfa, stateNames) {
  const closure = new Set(stateNames);
  const stack = [...stateNames];
  while (stack.length > 0) {
    const s = stack.pop();
    const targets = (nfa.trans[s] && nfa.trans[s]["ε"]) || [];
    for (const t of targets) {
      if (!closure.has(t)) { closure.add(t); stack.push(t); }
    }
  }
  return closure;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SIMULATION TREE  (fold-ε mode)
//
// Tree node: { id, state, depth, parent, children, dead, accepted, viaEps }
// depth 0  = start states (ε-closure of nfaStart)
// depth k  = states after consuming input[k-1], ε-closed
// viaEps   = true when the incoming edge involved ε-moves
//            (depth-0: state is not the start state itself;
//             depth-k: child not directly reachable from parent via sym alone)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NFA_MAX_TREE_NODES = 512;

// States reachable via sym + trailing ε from fromState, without ε-expanding fromState first.
function nfaDirectReach(nfa, fromState, sym) {
  const rawTargets = (nfa.trans[fromState] && nfa.trans[fromState][sym]) || [];
  return nfaEpsClosure(nfa, rawTargets);
}

// BFS: minimum number of ε-steps from fromState to toState (0 if equal, Infinity if unreachable).
function nfaEpsDistance(nfa, fromState, toState) {
  if (fromState === toState) return 0;
  const visited = new Set([fromState]);
  const queue = [[fromState, 0]];
  while (queue.length > 0) {
    const [s, dist] = queue.shift();
    for (const t of (nfa.trans[s]?.["ε"] || [])) {
      if (t === toState) return dist + 1;
      if (!visited.has(t)) { visited.add(t); queue.push([t, dist + 1]); }
    }
  }
  return Infinity;
}

// The states of a shortest ε-path from fromState to toState, both included ([fromState] when they are
// equal), or null when there is none.
function nfaEpsPath(nfa, fromState, toState) {
  if (fromState === toState) return [fromState];
  const prev = new Map([[fromState, null]]);
  const queue = [fromState];
  while (queue.length > 0) {
    const s = queue.shift();
    for (const t of (nfa.trans[s]?.["ε"] || [])) {
      if (prev.has(t)) continue;
      prev.set(t, s);
      if (t === toState) {
        const path = [t];
        for (let c = s; c !== null; c = prev.get(c)) path.unshift(c);
        return path;
      }
      queue.push(t);
    }
  }
  return null;
}

// For a tree edge parent --sym--> child (with ε-closure folded), compute the minimum
// ε-hop counts: (n1, n2) where parent --ε×n1--> r --sym--> t --ε×n2--> child.
// Picks the path with minimum n1, breaking ties by minimum n2.
function nfaEpsAnnotation(nfa, parentState, sym, childState) {
  let bestN1 = Infinity, bestN2 = Infinity;
  for (const r of nfaEpsClosure(nfa, [parentState])) {
    for (const t of (nfa.trans[r]?.[sym] || [])) {
      if (!nfaEpsClosure(nfa, [t]).has(childState)) continue;
      const n1 = nfaEpsDistance(nfa, parentState, r);
      const n2 = nfaEpsDistance(nfa, t, childState);
      if (n1 < bestN1 || (n1 === bestN1 && n2 < bestN2)) {
        bestN1 = n1; bestN2 = n2;
      }
    }
  }
  return {
    epsCountBefore: bestN1 === Infinity ? 0 : bestN1,
    epsCountAfter:  bestN2 === Infinity ? 0 : bestN2,
  };
}

// opts.errorName: a branch that cannot move gets a child with that name (error: true) which then stays there
// (one node per remaining symbol), so every level is still one symbol read.
function nfaBuildSimTree(nfa, inputStr, maxNodes = NFA_MAX_TREE_NODES, opts = {}) {
  const errorName = opts.errorName || null;
  let nodeId = 0;
  // Virtual root — not rendered, just a container for depth-0 nodes
  const vRoot = { id: nodeId++, state: null, depth: -1, children: [], parent: null };

  const startName = nfa.states[nfa.start];
  // Single root = start state; ε-closure of start is folded into the first sym-edges
  const rootNode = { id: nodeId++, state: startName, depth: 0, parent: vRoot,
                     children: [], dead: false, accepted: false,
                     viaEps: false, epsCountBefore: 0, epsCountAfter: 0 };
  vRoot.children.push(rootNode);
  let frontier = [rootNode];

  const chars = [...inputStr];

  for (let d = 0; d < chars.length; d++) {
    const sym = chars[d];
    const nextFrontier = [];

    const errChild = (node) => {
      const child = { id: nodeId++, state: errorName, depth: d + 1, parent: node, children: [], dead: false, accepted: false,
                      viaEps: false, epsCountBefore: 0, epsCountAfter: 0, error: true };
      node.children.push(child);
      nextFrontier.push(child);
    };

    for (const node of frontier) {
      if (nodeId > maxNodes) { node.dead = true; continue; }
      if (node.error) { errChild(node); continue; }

      // All states reachable via ε* sym ε* from node.state
      const nextStates = new Set();
      for (const s of nfaEpsClosure(nfa, [node.state])) {
        for (const ns of nfaDirectReach(nfa, s, sym)) nextStates.add(ns);
      }

      if (nextStates.size === 0) {
        node.dead = true;
        if (errorName) errChild(node);
      } else {
        for (const ns of nextStates) {
          if (nodeId > maxNodes) break;
          const { epsCountBefore, epsCountAfter } = nfaEpsAnnotation(nfa, node.state, sym, ns);
          const child = { id: nodeId++, state: ns, depth: d + 1, parent: node,
                          children: [], dead: false, accepted: false,
                          viaEps: epsCountBefore > 0 || epsCountAfter > 0,
                          epsCountBefore, epsCountAfter };
          node.children.push(child);
          nextFrontier.push(child);
        }
      }
    }
    frontier = nextFrontier;
  }

  // Mark terminal nodes.
  // depth 0 (empty input): ε-closure of start not expanded as separate nodes → check ε-closure.
  // depth > 0: all ε-reachable states are already explicit sibling leaves → check F directly.
  for (const n of frontier) {
    const accepts = (n.depth === 0)
      ? [...nfaEpsClosure(nfa, [n.state])].some(s => nfa.accepts.has(nfa.states.indexOf(s)))
      : nfa.accepts.has(nfa.states.indexOf(n.state));
    if (accepts) n.accepted = true;
    else n.rejected = true;
  }

  // The tree can be truncated, so the verdict comes from exact set simulation,
  // not from the (possibly cut-off) frontier.
  return { vRoot, maxDepth: chars.length, accepted: nfaAcceptsString(nfa, inputStr), truncated: nodeId > maxNodes };
}

// ── The error state ──────────────────────────────────────────────────
// Optionally a branch that cannot move enters an explicit error state instead of just ending. A state s
// has an error move on a symbol when no state of its ε-closure has a move on it. "Any symbol outside the
// alphabet" is written NFA_WILD (a private-use character that the views draw as a red "?").
const NFA_WILD = "\uE000";

// A name for the error state that no state of the automaton uses.
function nfaErrorName(nfa) {
  let name = "err";
  while (nfa.states.includes(name)) name += "′";
  return name;
}

// The alphabet symbols on which `state` enters the error state.
function nfaErrorSymbols(nfa, alphabet, state) {
  const closure = [...nfaEpsClosure(nfa, [state])];
  return alphabet.filter((a) => !closure.some((s) => ((nfa.trans[s] && nfa.trans[s][a]) || []).length > 0));
}

// ── Explaining a configuration ────────────────────────────────────────
// Plain data describing one node of the simulation tree (a state together with how much
// input has been read), for the explanation shown when a node is selected. ctx =
// { active, onAcceptPath }: whether the node is on the current frontier of the stepped
// simulation, and whether it lies on an accepting path. Fields:
//   state, closure (ε-closure of the state, sorted), consumed, remaining
//   arrival: null for the start state, else { fromState, sym, via, to, epsBefore, epsAfter }
//     read as: fromState --ε×epsBefore--> via --sym--> to --ε×epsAfter--> state
//   role: "initial" | "accepted" | "rejected" | "dead" | "live" | "expanded"; why: a sentence
function nfaExplainConfig(nfa, chars, node, ctx = {}) {
  const closure = [...nfaEpsClosure(nfa, [node.state])].sort();
  const next = chars[node.depth];
  const rest = node.depth < chars.length;
  const isAcc = (s) => nfa.accepts.has(nfa.states.indexOf(s));
  const set = (xs) => "{" + xs.join(", ") + "}";

  let role, why;
  if (node.error) {
    role = "error";
    const sym = chars[node.depth - 1];
    why = node.parent && node.parent.error
      ? `the error state absorbs the rest of the input (here ${sym}); it is not accepting, so the string is rejected.`
      : `no state of the ε-closure of ${node.parent.state} has a transition on ${sym}, so the NFA enters the error state. It stays there for the rest of the input and is not accepting.`;
  } else if (node.accepted) {
    role = "accepted";
    why = node.depth === 0
      ? `the input is empty and the ε-closure ${set(closure)} of the start state contains an accepting state, so the string is accepted.`
      : `all input is read and ${node.state} is an accepting state, so the string is accepted.`;
  } else if (node.rejected) {
    role = "rejected";
    why = node.depth === 0
      ? `the input is empty, but no state of the ε-closure ${set(closure)} is accepting.`
      : `all input is read, but ${node.state} is not an accepting state.`;
  } else if (node.dead && node.children.some((c) => c.error)) {
    role = "dead";
    why = `no state of the ε-closure ${set(closure)} has a transition on ${next}, so the NFA enters the error state.`;
  } else if (node.dead) {
    role = "dead";
    const canMove = closure.some((s) => (nfa.trans[s]?.[next] || []).length > 0);
    why = canMove
      ? "the simulation stopped growing here (the tree size limit was reached)."
      : `no state of the ε-closure ${set(closure)} has a transition on ${next}, so this branch ends here.`;
  } else if (ctx.active) {
    role = "live";
    why = rest
      ? `one of the states the NFA may be in after reading ${node.depth} of ${chars.length} symbols; the next symbol is ${next}.`
      : "one of the states the NFA may be in after reading all input.";
  } else {
    role = "expanded";
    why = `the NFA has moved on from here, to ${node.children.length} successor${node.children.length === 1 ? "" : "s"} (nondeterministic choices are shown as siblings).`;
  }
  const isRoot = !node.parent || node.parent.state === null;
  if (isRoot && role !== "accepted" && role !== "rejected" && role !== "dead") role = "initial";

  let arrival = null;
  if (node.error) {
    arrival = { error: true, fromState: node.parent.state, sym: chars[node.depth - 1] };
  } else if (!isRoot) {
    const sym = chars[node.depth - 1];
    const from = node.parent.state;
    let best = null;
    for (const r of nfaEpsClosure(nfa, [from])) {
      for (const t of nfa.trans[r]?.[sym] || []) {
        if (!nfaEpsClosure(nfa, [t]).has(node.state)) continue;
        const n1 = nfaEpsDistance(nfa, from, r), n2 = nfaEpsDistance(nfa, t, node.state);
        if (!best || n1 < best.epsBefore || (n1 === best.epsBefore && n2 < best.epsAfter)) best = { fromState: from, sym, via: r, to: t, epsBefore: n1, epsAfter: n2 };
      }
    }
    arrival = best;
  }

  return {
    state: node.state, closure,
    consumed: chars.slice(0, node.depth).join(""), remaining: chars.slice(node.depth).join(""),
    arrival, role, why, successors: node.children.length, onAcceptPath: !!ctx.onAcceptPath,
  };
}

// The cells of the transition table ("state|symbol") that the edge into a tree node uses: the ε-moves
// before the symbol, the transition on the symbol, and the ε-moves after it. [] for the start state.
// Used to link tree edges, graph edges and table cells when hovering.
function nfaEdgeCells(nfa, chars, node) {
  const a = nfaExplainConfig(nfa, chars, node).arrival;
  if (!a) return [];
  if (a.error) return [a.fromState + "|" + ((nfa.alphabet || []).includes(a.sym) ? a.sym : NFA_WILD)];
  const hops = (path) => (path ? path.slice(0, -1).map((s) => s + "|ε") : []);
  return [...hops(nfaEpsPath(nfa, a.fromState, a.via)), a.via + "|" + a.sym, ...hops(nfaEpsPath(nfa, a.to, node.state))];
}

