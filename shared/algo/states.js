// Pure helpers for editing the state list of an automaton (NFA, PDA, TM).
// No DOM access. States are identified by name in transitions but by index for
// start/accept markers, so removing a state must renumber those indices.

// The first "q0", "q1", ... not already used (fills gaps left by removals).
function freshStateName(states, prefix = "q") {
  const used = new Set(states);
  let n = 0;
  while (used.has(prefix + n)) n++;
  return prefix + n;
}

// Index of a marker (start/accept/reject) after the state at `removed` is deleted
// from a list that had `oldLength` states. A marker on the removed state moves to
// the state that took its place (or the new last state); result is always valid.
function indexAfterRemoval(index, removed, oldLength) {
  const shifted = index > removed ? index - 1 : index;
  return Math.min(Math.max(shifted, 0), oldLength - 2);
}

// Remove states[idx] from { states, start, accepts: Set<number> }.
// Returns the new model and the removed name; refuses to remove the last state.
// Callers still delete transitions that mention the removed name.
function removeStateAt(model, idx) {
  if (model.states.length <= 1 || idx < 0 || idx >= model.states.length) return null;
  const name = model.states[idx];
  const states = model.states.filter((_, i) => i !== idx);
  const accepts = new Set();
  for (const a of model.accepts) {
    if (a < idx) accepts.add(a);
    else if (a > idx) accepts.add(a - 1);
    // an accepting state that is removed simply stops being accepting
  }
  return { name, states, start: indexAfterRemoval(model.start, idx, model.states.length), accepts };
}
