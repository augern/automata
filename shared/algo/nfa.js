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

function nfaBuildSimTree(nfa, inputStr, maxNodes = NFA_MAX_TREE_NODES) {
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

    for (const node of frontier) {
      if (nodeId > maxNodes) { node.dead = true; continue; }

      // All states reachable via ε* sym ε* from node.state
      const nextStates = new Set();
      for (const s of nfaEpsClosure(nfa, [node.state])) {
        for (const ns of nfaDirectReach(nfa, s, sym)) nextStates.add(ns);
      }

      if (nextStates.size === 0) {
        node.dead = true;
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
